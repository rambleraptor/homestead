/**
 * AEP-154 preconditions: every resource's etag, and the conditional headers
 * that check it. A conditional write against a version the caller never saw
 * must change nothing; a conditional header the engine doesn't support must be
 * refused rather than ignored.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { BOOK_DEF, call, defineResource, makeEngine, type TestEngine } from './helpers';

let t: TestEngine;

beforeEach(async () => {
  t = await makeEngine();
  const res = await defineResource(t, BOOK_DEF);
  expect(res.ok).toBe(true);
  const created = await call(t.engine, 'POST', '/books?id=b1', { token: t.adminToken, body: { title: 'Dune' } });
  expect(created.status).toBe(201);
});

async function etagOf(path = '/books/b1'): Promise<string> {
  const res = await call(t.engine, 'GET', path, { token: t.adminToken });
  return ((await res.json()) as { etag: string }).etag;
}

const patch = (body: unknown, headers: Record<string, string> = {}) =>
  call(t.engine, 'PATCH', '/books/b1', {
    token: t.adminToken,
    body,
    contentType: 'application/merge-patch+json',
    headers,
  });

describe('etag', () => {
  test('every record carries a quoted, strong etag, also sent as the ETag header', async () => {
    const res = await call(t.engine, 'GET', '/books/b1', { token: t.adminToken });
    const book = (await res.json()) as { etag: string };
    expect(book.etag).toMatch(/^"[^"]+"$/);
    expect(res.headers.get('ETag')).toBe(book.etag);
  });

  test('list results carry each record’s etag', async () => {
    const res = await call(t.engine, 'GET', '/books', { token: t.adminToken });
    const { results } = (await res.json()) as { results: Array<{ etag: string }> };
    expect(results[0]!.etag).toBe(await etagOf());
  });

  test('changes with every change to the resource, and only then', async () => {
    const before = await etagOf();
    expect(await etagOf()).toBe(before);
    const res = await patch({ pages: 412 });
    const updated = (await res.json()) as { etag: string };
    expect(updated.etag).not.toBe(before);
    expect(res.headers.get('ETag')).toBe(updated.etag);
    expect(await etagOf()).toBe(updated.etag);
  });

  test('cannot be written: an etag in a body is ignored, not stored', async () => {
    const before = await etagOf();
    const res = await patch({ etag: '"forged"', title: 'Dune Messiah' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { etag: string }).etag).not.toBe('"forged"');
    expect(before).not.toBe(await etagOf());
  });
});

describe('If-Match on writes', () => {
  test('a PATCH against the current etag goes ahead', async () => {
    const res = await patch({ pages: 100 }, { 'If-Match': await etagOf() });
    expect(res.status).toBe(200);
  });

  test('a PATCH against a stale etag is 412 and changes nothing', async () => {
    const stale = await etagOf();
    await patch({ pages: 1 }); // someone else's write
    const res = await patch({ title: 'Overwritten' }, { 'If-Match': stale });
    expect(res.status).toBe(412);
    const book = await (await call(t.engine, 'GET', '/books/b1', { token: t.adminToken })).json();
    expect(book).toMatchObject({ title: 'Dune', pages: 1 });
  });

  test('a DELETE against a stale etag is 412 and the record stays', async () => {
    const stale = await etagOf();
    await patch({ pages: 1 });
    const res = await call(t.engine, 'DELETE', '/books/b1', { token: t.adminToken, headers: { 'If-Match': stale } });
    expect(res.status).toBe(412);
    expect((await call(t.engine, 'GET', '/books/b1', { token: t.adminToken })).status).toBe(200);
  });

  test('a DELETE against the current etag deletes', async () => {
    const res = await call(t.engine, 'DELETE', '/books/b1', {
      token: t.adminToken,
      headers: { 'If-Match': await etagOf() },
    });
    expect(res.status).toBe(204);
  });

  test('a PUT (apply) honours If-Match; on a missing resource nothing matches', async () => {
    const stale = await etagOf();
    await patch({ pages: 1 });
    const replace = await call(t.engine, 'PUT', '/books/b1', {
      token: t.adminToken,
      body: { title: 'Replaced' },
      headers: { 'If-Match': stale },
    });
    expect(replace.status).toBe(412);
    const missing = await call(t.engine, 'PUT', '/books/nope', {
      token: t.adminToken,
      body: { title: 'New' },
      headers: { 'If-Match': stale },
    });
    expect(missing.status).toBe(412);
  });

  test('* matches any existing resource; a list of tags matches any of them', async () => {
    expect((await patch({ pages: 2 }, { 'If-Match': '*' })).status).toBe(200);
    const current = await etagOf();
    expect((await patch({ pages: 3 }, { 'If-Match': `"other", ${current}` })).status).toBe(200);
  });

  test('a weak tag never satisfies If-Match (strong comparison)', async () => {
    const res = await patch({ pages: 4 }, { 'If-Match': `W/${await etagOf()}` });
    expect(res.status).toBe(412);
  });
});

describe('conditional reads', () => {
  test('If-None-Match on the current etag is 304 with no body', async () => {
    const etag = await etagOf();
    const res = await call(t.engine, 'GET', '/books/b1', { token: t.adminToken, headers: { 'If-None-Match': etag } });
    expect(res.status).toBe(304);
    expect(res.headers.get('ETag')).toBe(etag);
    expect(await res.text()).toBe('');
  });

  test('If-None-Match compares weakly; a stale one gets the record', async () => {
    const etag = await etagOf();
    const weak = await call(t.engine, 'GET', '/books/b1', { token: t.adminToken, headers: { 'If-None-Match': `W/${etag}` } });
    expect(weak.status).toBe(304);
    await patch({ pages: 9 });
    const changed = await call(t.engine, 'GET', '/books/b1', { token: t.adminToken, headers: { 'If-None-Match': etag } });
    expect(changed.status).toBe(200);
  });

  test('If-Match on a read of a changed resource is 412', async () => {
    const stale = await etagOf();
    await patch({ pages: 9 });
    const res = await call(t.engine, 'GET', '/books/b1', { token: t.adminToken, headers: { 'If-Match': stale } });
    expect(res.status).toBe(412);
  });
});

describe('unsupported conditions are refused, never ignored', () => {
  test.each([
    ['a list', 'GET', '/books', undefined],
    ['a create', 'POST', '/books?id=b2', { title: 'Emma' }],
    ['the resource definitions', 'GET', '/aep-resource-definitions', undefined],
    ['the users collection', 'GET', '/users', undefined],
  ])('If-Match on %s is 400', async (_what, method, path, body) => {
    const res = await call(t.engine, method, path, { token: t.adminToken, body, headers: { 'If-Match': '"x"' } });
    expect(res.status).toBe(400);
  });

  test('If-None-Match on a write is 400', async () => {
    const res = await patch({ pages: 1 }, { 'If-None-Match': await etagOf() });
    expect(res.status).toBe(400);
  });
});
