import { beforeEach, describe, expect, it } from 'vitest';
import { KEEP_MS, MAX_PENDING, boxOf, handle, sweep, webLink, type DropBoxDeps } from '../src/app';
import { memoryStore } from '../src/memory-store';

const ORIGIN = 'https://drop.example';
const SECRET = 'admin-secret-for-tests';
const KEY = 'k'.repeat(43);

let deps: DropBoxDeps;
let clock: number;

beforeEach(() => {
  clock = Date.UTC(2026, 10, 12, 12, 0, 0);
  deps = { store: memoryStore(), adminSecret: SECRET, now: () => clock };
});

const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handle(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    deps,
  );
const asAdmin = { authorization: `Bearer ${SECRET}` };
const leave = (url: unknown, key = KEY) => send('POST', `/in/${key}`, { url });
const pending = async (box: string) =>
  ((await (await send('GET', `/boxes/${box}/links`, undefined, asAdmin)).json()) as { links: { seq: number; url: string; id: string }[] }).links;

describe('leaving a link', () => {
  it('keeps a link left under a registered key', async () => {
    const box = await boxOf(KEY);
    await send('PUT', `/boxes/${box}`, undefined, asAdmin);

    const res = await leave('https://example.com/article?x=1');
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
    expect((await pending(box)).map((l) => l.url)).toEqual(['https://example.com/article?x=1']);
  });

  it('refuses a key nobody registered, and stores nothing', async () => {
    expect((await leave('https://example.com/')).status).toBe(404);
    expect(await deps.store.countLinks(await boxOf(KEY))).toBe(0);
  });

  it('refuses a key that is not shaped like one', async () => {
    expect((await leave('https://example.com/', 'short')).status).toBe(404);
    expect((await leave('https://example.com/', `${'k'.repeat(40)}!!!`)).status).toBe(404);
  });

  it('takes only web links', async () => {
    await send('PUT', `/boxes/${await boxOf(KEY)}`, undefined, asAdmin);
    for (const bad of ['javascript:alert(1)', 'ftp://example.com/x', 'not a link', '', 42, null, `https://example.com/${'a'.repeat(2100)}`, 'https://user:pass@example.com/']) {
      expect((await leave(bad)).status, String(bad).slice(0, 30)).toBe(400);
    }
    expect((await send('POST', `/in/${KEY}`, 'not json')).status).toBe(400);
    expect((await send('POST', `/in/${KEY}`, ['https://example.com'])).status).toBe(400);
    expect(await deps.store.countLinks(await boxOf(KEY))).toBe(0);
  });

  it('refuses a body too large to be a link', async () => {
    await send('PUT', `/boxes/${await boxOf(KEY)}`, undefined, asAdmin);
    expect((await send('POST', `/in/${KEY}`, { url: 'https://example.com/', padding: 'x'.repeat(5000) })).status).toBe(400);
  });

  it('stops taking links once a box is full', async () => {
    const box = await boxOf(KEY);
    await send('PUT', `/boxes/${box}`, undefined, asAdmin);
    for (let i = 0; i < MAX_PENDING; i++) expect((await leave(`https://example.com/${i}`)).status).toBe(202);
    expect((await leave('https://example.com/one-too-many')).status).toBe(429);
    expect(await deps.store.countLinks(box)).toBe(MAX_PENDING);
  });

  it('turns away a sender who is over the limit', async () => {
    await send('PUT', `/boxes/${await boxOf(KEY)}`, undefined, asAdmin);
    deps.allow = async (sender) => sender !== '203.0.113.9';
    expect((await send('POST', `/in/${KEY}`, { url: 'https://example.com/' }, { 'cf-connecting-ip': '203.0.113.9' })).status).toBe(429);
    expect((await send('POST', `/in/${KEY}`, { url: 'https://example.com/' }, { 'cf-connecting-ip': '203.0.113.10' })).status).toBe(202);
  });

  it('only answers POST', async () => {
    expect((await send('GET', `/in/${KEY}`)).status).toBe(405);
  });
});

describe('collecting', () => {
  it('hands links over oldest first and forgets what was acknowledged', async () => {
    const box = await boxOf(KEY);
    await send('PUT', `/boxes/${box}`, undefined, asAdmin);
    await leave('https://example.com/1');
    await leave('https://example.com/2');
    await leave('https://example.com/3');

    const links = await pending(box);
    expect(links.map((l) => l.url)).toEqual(['https://example.com/1', 'https://example.com/2', 'https://example.com/3']);
    expect(new Set(links.map((l) => l.id)).size).toBe(3);

    const ack = await send('POST', `/boxes/${box}/ack`, { through: links[1]!.seq }, asAdmin);
    expect(await ack.json()).toEqual({ removed: 2 });
    expect((await pending(box)).map((l) => l.url)).toEqual(['https://example.com/3']);
  });

  it('keeps boxes apart', async () => {
    const other = 'o'.repeat(43);
    await send('PUT', `/boxes/${await boxOf(KEY)}`, undefined, asAdmin);
    await send('PUT', `/boxes/${await boxOf(other)}`, undefined, asAdmin);
    await leave('https://example.com/mine');
    await leave('https://example.com/theirs', other);

    expect((await pending(await boxOf(KEY))).map((l) => l.url)).toEqual(['https://example.com/mine']);
    await send('POST', `/boxes/${await boxOf(KEY)}/ack`, { through: 999 }, asAdmin);
    expect((await pending(await boxOf(other))).map((l) => l.url)).toEqual(['https://example.com/theirs']);
  });

  it('removing a box removes what was waiting and stops it taking links', async () => {
    const box = await boxOf(KEY);
    await send('PUT', `/boxes/${box}`, undefined, asAdmin);
    await leave('https://example.com/1');

    expect((await send('DELETE', `/boxes/${box}`, undefined, asAdmin)).status).toBe(200);
    expect((await leave('https://example.com/2')).status).toBe(404);
    expect((await send('GET', `/boxes/${box}/links`, undefined, asAdmin)).status).toBe(404);
    await send('PUT', `/boxes/${box}`, undefined, asAdmin);
    expect(await pending(box)).toEqual([]);
  });

  it('forgets links nobody collected after a week', async () => {
    const box = await boxOf(KEY);
    await send('PUT', `/boxes/${box}`, undefined, asAdmin);
    await leave('https://example.com/old');
    clock += KEEP_MS + 1000;
    await leave('https://example.com/new');

    expect(await sweep(deps.store, clock)).toBe(1);
    expect((await pending(box)).map((l) => l.url)).toEqual(['https://example.com/new']);
  });
});

describe('the admin routes', () => {
  it('refuse anyone without the secret', async () => {
    const box = await boxOf(KEY);
    const attempts: Record<string, string>[] = [
      {},
      { authorization: 'Bearer wrong' },
      { authorization: SECRET },
      { authorization: `Bearer ${SECRET}x` },
    ];
    for (const headers of attempts) {
      expect((await send('PUT', `/boxes/${box}`, undefined, headers)).status).toBe(401);
      expect((await send('GET', `/boxes/${box}/links`, undefined, headers)).status).toBe(401);
      expect((await send('POST', `/boxes/${box}/ack`, { through: 1 }, headers)).status).toBe(401);
      expect((await send('DELETE', `/boxes/${box}`, undefined, headers)).status).toBe(401);
    }
    expect(await deps.store.hasBox(box)).toBe(false);
  });

  it('refuse everyone when no secret is set', async () => {
    deps.adminSecret = undefined;
    expect((await send('PUT', `/boxes/${await boxOf(KEY)}`, undefined, { authorization: 'Bearer ' })).status).toBe(401);
    expect((await send('PUT', `/boxes/${await boxOf(KEY)}`, undefined, { authorization: 'Bearer undefined' })).status).toBe(401);
  });

  it('take only a well-formed box id and acknowledgement', async () => {
    expect((await send('PUT', '/boxes/not-a-hash', undefined, asAdmin)).status).toBe(400);
    const box = await boxOf(KEY);
    await send('PUT', `/boxes/${box}`, undefined, asAdmin);
    expect((await send('POST', `/boxes/${box}/ack`, { through: 'all' }, asAdmin)).status).toBe(400);
    expect((await send('POST', `/boxes/${box}/ack`, { through: -1 }, asAdmin)).status).toBe(400);
  });
});

describe('everything else', () => {
  it('is not found, and says nothing about what this is', async () => {
    for (const path of ['/', '/health', '/in', '/boxes', '/in/a/b']) {
      const res = await send('GET', path);
      expect(res.status, path).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found.' });
    }
  });
});

describe('webLink', () => {
  it('normalizes a link and refuses what is not one', () => {
    expect(webLink('  https://Example.com/a b ')).toBe('https://example.com/a%20b');
    expect(webLink('http://example.com')).toBe('http://example.com/');
    expect(webLink('mailto:a@b.co')).toBeNull();
  });
});
