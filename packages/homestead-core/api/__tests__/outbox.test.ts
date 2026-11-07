/**
 * The outbox: queued writes as AEP standard-method requests, addressed by
 * AEP-122 resource names. These drive it through a fake transport, so they
 * pin the queue's own rules — order, parking, folding, error handling,
 * persistence — independent of the server.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AepbaseError } from '../aepbase';
import { NetworkError } from '../connectivity';
import type { KeyValueStore } from '../offlineStore';
import { secretFieldIndex } from '../redactSecrets';
import type { ResourceDefinition } from '../../resources/types';
import {
  Outbox,
  OUTBOX_STORAGE_KEY,
  applyMergePatch,
  applyPendingWrites,
  composeMergePatches,
  parseResourceName,
  resourceName,
  type OutboxRequest,
  type OutboxResult,
} from '../outbox';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    delete: async (key) => void data.delete(key),
  };
}

/** A transport that records what it was sent and answers from `respond`. */
function fakeTransport(
  respond: (r: OutboxRequest) => Promise<Record<string, unknown> | undefined> = async (r) =>
    r.method === 'delete' ? undefined : { path: r.name, ...(r.body ?? {}) },
) {
  const sent: Array<Pick<OutboxRequest, 'method' | 'name' | 'body'>> = [];
  return {
    sent,
    send: vi.fn(async (r: OutboxRequest) => {
      sent.push({ method: r.method, name: r.name, ...(r.body ? { body: r.body } : {}) });
      return respond(r);
    }),
  };
}

function setup(opts: { online?: boolean; transport?: ReturnType<typeof fakeTransport> } = {}) {
  let online = opts.online ?? true;
  const store = memoryStore();
  const transport = opts.transport ?? fakeTransport();
  const results: OutboxResult[] = [];
  const outbox = new Outbox({
    store,
    transport,
    isOnline: () => online,
    secretFields: () =>
      secretFieldIndex([
        {
          singular: 'gift-card',
          plural: 'gift-cards',
          fields: { pin: { type: 'string', encrypted: true } },
        } as unknown as ResourceDefinition,
      ]),
  });
  outbox.onResult((r) => results.push(r));
  return {
    outbox,
    store,
    transport,
    results,
    goOnline: () => {
      online = true;
      return outbox.drain();
    },
    goOffline: () => {
      online = false;
    },
  };
}

/** Let queued microtasks (the drain loop, saves) run. */
const settled = () => new Promise((r) => setTimeout(r, 0));

describe('resource names (AEP-122)', () => {
  it('builds and parses top-level and nested names', () => {
    expect(resourceName('gift-cards', 'g1')).toBe('gift-cards/g1');
    expect(resourceName('perks', 'p1', 'credit-cards/c1')).toBe('credit-cards/c1/perks/p1');
    expect(parseResourceName('credit-cards/c1/perks/p1')).toEqual({
      parent: ['credit-cards', 'c1'],
      collection: 'perks',
      id: 'p1',
    });
    expect(parseResourceName('gift-cards/g1')).toEqual({ parent: [], collection: 'gift-cards', id: 'g1' });
  });

  it('rejects something that is not a name', () => {
    expect(() => parseResourceName('gift-cards')).toThrow();
    expect(() => parseResourceName('gift-cards//x')).toThrow();
  });
});

describe('JSON Merge Patch (RFC 7396)', () => {
  it('applies: null removes, objects merge, the rest replaces', () => {
    expect(applyMergePatch({ a: 1, b: { x: 1, y: 2 }, c: 3 }, { a: 2, b: { y: null, z: 3 }, c: null })).toEqual({
      a: 2,
      b: { x: 1, z: 3 },
    });
  });

  it('composes two patches into one with the same effect', () => {
    const first = { a: 1, b: { x: 1 } };
    const second = { b: { y: 2 }, c: null };
    const target = { b: { w: 0 }, c: 9 };
    const composed = composeMergePatches(first, second)!;
    expect(applyMergePatch(target, composed)).toEqual(applyMergePatch(applyMergePatch(target, first), second));
  });

  it('refuses to compose when one patch could not say it', () => {
    expect(composeMergePatches({ b: null }, { b: { y: 2 } })).toBeNull();
  });
});

describe('Outbox', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends each request as its AEP method, in order', async () => {
    const { outbox, transport } = setup();
    outbox.enqueue('create', 'gift-cards/g1', { merchant: 'Acme' });
    outbox.enqueue('create', 'groceries/x1', { name: 'milk' });
    outbox.enqueue('delete', 'stores/s1');
    await settled();
    expect(transport.sent).toEqual([
      { method: 'create', name: 'gift-cards/g1', body: { merchant: 'Acme' } },
      { method: 'create', name: 'groceries/x1', body: { name: 'milk' } },
      { method: 'delete', name: 'stores/s1' },
    ]);
    expect(outbox.requests()).toEqual([]);
  });

  it("resolves a ticket with the server's record", async () => {
    const { outbox } = setup();
    const ticket = outbox.enqueue('create', 'gift-cards/g1', { merchant: 'Acme' });
    await expect(ticket.done).resolves.toEqual({ path: 'gift-cards/g1', merchant: 'Acme' });
  });

  it('holds writes while offline, parked, and sends them on reconnect', async () => {
    const { outbox, transport, goOffline, goOnline } = setup();
    goOffline();
    const ticket = outbox.enqueue('create', 'groceries/x1', { name: 'milk' });
    await ticket.parked;
    expect(outbox.isParked()).toBe(true);
    expect(transport.sent).toEqual([]);
    await goOnline();
    expect(transport.sent).toHaveLength(1);
    expect(outbox.isParked()).toBe(false);
  });

  it('keeps a request that never reached the server, and parks', async () => {
    let fail = true;
    const transport = fakeTransport(async (r) => {
      if (fail) throw new NetworkError(new TypeError('Failed to fetch'));
      return { path: r.name };
    });
    const { outbox } = setup({ transport });
    const ticket = outbox.enqueue('create', 'groceries/x1', { name: 'milk' });
    await ticket.parked;
    expect(outbox.requests()).toHaveLength(1);
    fail = false;
    await outbox.drain();
    expect(outbox.requests()).toHaveLength(0);
    await expect(ticket.done).resolves.toEqual({ path: 'groceries/x1' });
  });

  it("rejects a ticket with the server's error and drops the request", async () => {
    const transport = fakeTransport(async () => {
      throw new AepbaseError(400, 'merchant is required', '/gift-cards');
    });
    const { outbox, results } = setup({ transport });
    const ticket = outbox.enqueue('create', 'gift-cards/g1', {});
    await expect(ticket.done).rejects.toThrow('merchant is required');
    expect(outbox.requests()).toEqual([]);
    expect(results[0]).toMatchObject({ ok: false, awaited: true });
  });

  it('reports a refusal nobody is waiting for as unawaited', async () => {
    const transport = fakeTransport(async () => {
      throw new AepbaseError(400, 'nope', '/gift-cards');
    });
    const { outbox, results, goOffline, goOnline } = setup({ transport });
    goOffline();
    await outbox.enqueue('create', 'gift-cards/g1', {}).parked;
    await goOnline();
    expect(results[0]).toMatchObject({ ok: false, awaited: false });
  });

  it('drops what was queued beneath a create the server refused', async () => {
    const transport = fakeTransport(async (r) => {
      if (r.name === 'credit-cards/c1') throw new AepbaseError(400, 'bad card', '/credit-cards');
      return { path: r.name };
    });
    const { outbox, goOffline, goOnline } = setup({ transport });
    goOffline();
    outbox.enqueue('create', 'credit-cards/c1', { name: 'Sapphire' });
    outbox.enqueue('create', 'credit-cards/c1/perks/p1', { name: 'Lounge' });
    outbox.enqueue('create', 'credit-cards/c2', { name: 'Other' });
    await goOnline();
    expect(transport.sent.map((r) => r.name)).toEqual(['credit-cards/c1', 'credit-cards/c2']);
  });

  describe('folding writes to one name', () => {
    it('folds an update into a queued create', async () => {
      const { outbox, transport, goOffline, goOnline } = setup();
      goOffline();
      outbox.enqueue('create', 'groceries/x1', { name: 'milk', checked: false });
      outbox.enqueue('update', 'groceries/x1', { checked: true });
      expect(outbox.requests()).toHaveLength(1);
      await goOnline();
      expect(transport.sent).toEqual([
        { method: 'create', name: 'groceries/x1', body: { name: 'milk', checked: true } },
      ]);
    });

    it('composes two updates into one patch', async () => {
      const { outbox, transport, goOffline, goOnline } = setup();
      goOffline();
      outbox.enqueue('update', 'groceries/x1', { checked: true });
      outbox.enqueue('update', 'groceries/x1', { name: 'oat milk' });
      await goOnline();
      expect(transport.sent).toEqual([
        { method: 'update', name: 'groceries/x1', body: { checked: true, name: 'oat milk' } },
      ]);
    });

    it('never sends a create and delete of the same record', async () => {
      const { outbox, transport, goOffline, goOnline } = setup();
      goOffline();
      outbox.enqueue('create', 'credit-cards/c1', { name: 'Sapphire' });
      outbox.enqueue('create', 'credit-cards/c1/perks/p1', { name: 'Lounge' });
      const ticket = outbox.enqueue('delete', 'credit-cards/c1');
      await expect(ticket.done).resolves.toBeUndefined();
      await goOnline();
      expect(transport.sent).toEqual([]);
    });

    it('drops queued updates to a record that is then deleted', async () => {
      const { outbox, transport, goOffline, goOnline } = setup();
      goOffline();
      outbox.enqueue('update', 'groceries/x1', { checked: true });
      outbox.enqueue('delete', 'groceries/x1');
      await goOnline();
      expect(transport.sent).toEqual([{ method: 'delete', name: 'groceries/x1' }]);
    });

    it('does not fold into a request already on its way', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const transport = fakeTransport(async (r) => {
        if (r.method === 'create') await gate;
        return { path: r.name, ...(r.body ?? {}) };
      });
      const { outbox } = setup({ transport });
      outbox.enqueue('create', 'groceries/x1', { name: 'milk' });
      await settled(); // the create is now in flight
      outbox.enqueue('update', 'groceries/x1', { checked: true });
      release();
      await settled();
      await settled();
      expect(transport.sent.map((r) => r.method)).toEqual(['create', 'update']);
    });

    it("answers a folded request's ticket with the request it joined", async () => {
      const { outbox, goOffline, goOnline } = setup();
      goOffline();
      outbox.enqueue('create', 'groceries/x1', { name: 'milk' });
      const update = outbox.enqueue('update', 'groceries/x1', { checked: true });
      await goOnline();
      await expect(update.done).resolves.toEqual({ path: 'groceries/x1', name: 'milk', checked: true });
    });
  });

  describe('on the device', () => {
    it('saves the queue and loads it back in a new page', async () => {
      const first = setup({ online: false });
      first.outbox.enqueue('create', 'groceries/x1', { name: 'milk' });
      await settled();

      const transport = fakeTransport();
      const reloaded = new Outbox({ store: first.store, transport, isOnline: () => true });
      await reloaded.load();
      await settled();
      expect(transport.sent).toEqual([{ method: 'create', name: 'groceries/x1', body: { name: 'milk' } }]);
    });

    it('keeps a request carrying a secret off the device', async () => {
      const { outbox, store } = setup({ online: false });
      outbox.enqueue('update', 'gift-cards/g1', { pin: '8642' });
      outbox.enqueue('update', 'gift-cards/g2', { merchant: 'Acme' });
      await settled();
      const saved = store.data.get(OUTBOX_STORAGE_KEY)!;
      expect(saved).toContain('gift-cards/g2');
      expect(saved).not.toContain('8642');
      expect(outbox.requests()).toHaveLength(2);
    });

    it('clears the saved queue once everything is sent', async () => {
      const { outbox, store, goOffline, goOnline } = setup();
      goOffline();
      outbox.enqueue('create', 'groceries/x1', { name: 'milk' });
      await settled();
      expect(store.data.has(OUTBOX_STORAGE_KEY)).toBe(true);
      await goOnline();
      await settled();
      expect(store.data.has(OUTBOX_STORAGE_KEY)).toBe(false);
    });

    it('clear() forgets everything queued', async () => {
      const { outbox, store, transport, goOnline } = setup({ online: false });
      outbox.enqueue('create', 'groceries/x1', { name: 'milk' });
      await outbox.clear();
      await goOnline();
      expect(transport.sent).toEqual([]);
      expect(store.data.has(OUTBOX_STORAGE_KEY)).toBe(false);
    });
  });
});

describe('applyPendingWrites', () => {
  const req = (method: OutboxRequest['method'], name: string, body?: Record<string, unknown>): OutboxRequest => ({
    request_id: name + method,
    method,
    name,
    ...(body ? { body } : {}),
    enqueue_time: '2026-11-02T00:00:00Z',
  });
  const rows = [
    { id: 'a', path: 'groceries/a', name: 'Apples', checked: false },
    { id: 'b', path: 'groceries/b', name: 'Bread', checked: false },
  ];

  it('shows each AEP method’s effect on a read', () => {
    const out = applyPendingWrites(rows, 'groceries', [
      req('create', 'groceries/c', { name: 'Cheese' }),
      req('update', 'groceries/a', { checked: true }),
      req('delete', 'groceries/b'),
    ]);
    expect(out).toEqual([
      { id: 'a', path: 'groceries/a', name: 'Apples', checked: true },
      expect.objectContaining({ id: 'c', path: 'groceries/c', name: 'Cheese' }),
    ]);
  });

  it('leaves other collections, and records beneath these, alone', () => {
    const out = applyPendingWrites(rows, 'groceries', [
      req('create', 'stores/s1', { name: 'Aldi' }),
      req('delete', 'groceries/a/notes/n1'),
    ]);
    expect(out).toEqual(rows);
  });

  it('does not add a create the read already has', () => {
    expect(applyPendingWrites(rows, 'groceries', [req('create', 'groceries/a', { name: 'Dup' })])).toEqual(rows);
  });

  it('matches one parent’s children by the full collection name', () => {
    const perks = [{ id: 'p1', path: 'credit-cards/c1/perks/p1', name: 'Lounge' }];
    const out = applyPendingWrites(perks, 'credit-cards/c1/perks', [
      req('update', 'credit-cards/c1/perks/p1', { name: 'Lounge+' }),
      req('update', 'credit-cards/c2/perks/p1', { name: 'Other card' }),
    ]);
    expect(out[0]!.name).toBe('Lounge+');
  });
});

describe('conditional edits (If-Match)', () => {
  it('sends an edit with the version it was made against, rebased on this device’s own writes', async () => {
    const versions: Array<string | undefined> = [];
    const transport = fakeTransport(async (r) => {
      versions.push(r.if_match);
      return { path: r.name, ...(r.body ?? {}), update_time: `v${versions.length + 1}` };
    });
    const { outbox, goOnline } = setup({ online: false, transport });
    outbox.enqueue('update', 'notes/n1', { meta: null }, { ifMatch: 'v1' });
    // Can't fold into the first (a removed key then set to an object), so it's
    // queued on its own, with the version this device last saw.
    outbox.enqueue('update', 'notes/n1', { meta: { x: 1 } }, { ifMatch: 'local' });
    await goOnline();
    expect(versions[0]).toBe('v1');
    // Queued on top of the first edit: sent against the version it produced.
    expect(versions[1]).toBe('v2');
  });

  it('refuses later edits with a refused one, reporting it once with the whole change', async () => {
    const transport = fakeTransport(async () => {
      throw new AepbaseError(412, 'changed', '/notes/n1');
    });
    const { outbox, goOnline, results } = setup({ online: false, transport });
    const first = outbox.enqueue('update', 'notes/n1', { body: null }, { ifMatch: 'v1' });
    const second = outbox.enqueue('update', 'notes/n1', { body: { text: 'b' } }, { ifMatch: 'local' });
    await goOnline();
    await expect(first.done).rejects.toThrow();
    await expect(second.done).rejects.toThrow();
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]!.request.body).toEqual({ body: { text: 'b' } });
    expect(outbox.requests()).toHaveLength(0);
  });
});
