/**
 * Tests for the static resource-definition syncer.
 *
 * The runner is pure HTTP against aepbase's resource-definition API,
 * so these mock `fetch` directly and assert the request sequence.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { syncResourceDefinitions } from '../sync';
import type { ResourceDefinition } from '../types';

const BASE = 'http://aepbase.test';
const TOKEN = 'admin-token';
const SILENT_LOGGER = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const PARENT: ResourceDefinition = {
  singular: 'parent',
  plural: 'parents',
  user_settable_create: true,
  fields: { name: { type: 'string' } },
};

/** What aepbase stores/returns for PARENT — the translated wire schema. */
const PARENT_WIRE = {
  singular: 'parent',
  plural: 'parents',
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: { name: { type: 'string' } },
  },
};

const CHILD: ResourceDefinition = {
  singular: 'child',
  plural: 'children',
  user_settable_create: true,
  parents: ['parent'],
  fields: { value: { type: 'string' } },
};

describe('syncResourceDefinitions', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('creates missing definitions in parent-then-child order', async () => {
    // 1) LIST returns no existing defs
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    // 2) POST parent
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    // 3) POST child
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    // Pass child before parent to prove topo sort actually runs
    const result = await syncResourceDefinitions({
      aepbaseUrl: BASE,
      token: TOKEN,
      defs: [CHILD, PARENT],
      logger: SILENT_LOGGER,
    });

    expect(result.created).toEqual(['parent', 'child']);
    expect(result.updated).toEqual([]);
    expect(result.unchanged).toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [listUrl] = fetchMock.mock.calls[0];
    expect(listUrl).toBe(
      `${BASE}/aep-resource-definitions?max_page_size=200`,
    );
    const [parentUrl, parentInit] = fetchMock.mock.calls[1];
    expect(parentUrl).toBe(`${BASE}/aep-resource-definitions?id=parent`);
    expect(parentInit.method).toBe('POST');
    // The body carries the translated JSON schema, never authored fields.
    const parentBody = JSON.parse(parentInit.body);
    expect(parentBody.schema).toEqual(PARENT_WIRE.schema);
    expect(parentBody.fields).toBeUndefined();
    const [childUrl] = fetchMock.mock.calls[2];
    expect(childUrl).toBe(`${BASE}/aep-resource-definitions?id=child`);
  });

  it('no-ops when the existing schema and metadata match', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ results: [{ id: 'parent' }] }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(PARENT_WIRE), { status: 200 }),
    );

    const result = await syncResourceDefinitions({
      aepbaseUrl: BASE,
      token: TOKEN,
      defs: [PARENT],
      logger: SILENT_LOGGER,
    });

    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.unchanged).toEqual(['parent']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('PATCHes independent_access on and back off when the declaration changes', async () => {
    const childWire = {
      singular: 'child',
      plural: 'children',
      user_settable_create: true,
      parents: ['parent'],
      schema: { type: 'object', properties: { value: { type: 'string' } } },
    };
    // Answer by URL: the list, each stored definition, and any PATCH.
    const run = async (stored: Record<string, unknown>, def: ResourceDefinition) => {
      fetchMock.mockReset();
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') return new Response('{}', { status: 200 });
        if (url.includes('?max_page_size')) {
          return new Response(JSON.stringify({ results: [{ id: 'parent' }, { id: 'child' }] }));
        }
        return new Response(JSON.stringify(url.endsWith('/child') ? stored : PARENT_WIRE));
      });
      return syncResourceDefinitions({
        aepbaseUrl: BASE,
        token: TOKEN,
        defs: [PARENT, def],
        logger: SILENT_LOGGER,
      });
    };
    const patchBody = () => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
      return JSON.parse(call![1].body as string) as Record<string, unknown>;
    };

    // Opting out: the engine still inherits, so the sync turns the flag on.
    const optOut = await run(childWire, { ...CHILD, independent_access: true });
    expect(optOut.updated).toEqual(['child']);
    expect(patchBody().independent_access).toBe(true);

    // Dropping the opt-out sends an explicit false, so inheritance comes back.
    const optIn = await run({ ...childWire, independent_access: true }, CHILD);
    expect(optIn.updated).toEqual(['child']);
    expect(patchBody().independent_access).toBe(false);

    // In step either way: no PATCH.
    const steady = await run(childWire, CHILD);
    expect(steady.unchanged).toEqual(['parent', 'child']);
  });

  it('PATCHes when the schema has drifted', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ results: [{ id: 'parent' }] }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...PARENT_WIRE,
          schema: {
            type: 'object',
            properties: { name: { type: 'string' }, extra: { type: 'string' } },
          },
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const result = await syncResourceDefinitions({
      aepbaseUrl: BASE,
      token: TOKEN,
      defs: [PARENT],
      logger: SILENT_LOGGER,
    });

    expect(result.updated).toEqual(['parent']);
    const [patchUrl, patchInit] = fetchMock.mock.calls[2];
    expect(patchUrl).toBe(`${BASE}/aep-resource-definitions/parent`);
    expect(patchInit.method).toBe('PATCH');
    expect(patchInit.headers['Content-Type']).toBe(
      'application/merge-patch+json',
    );
    // With no authorized drops, the drop-authorization header is absent.
    expect(patchInit.headers['X-Homestead-Authorized-Drops']).toBeUndefined();
  });

  it('forwards authorized drops as a header on the PATCH', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [{ id: 'parent' }] }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...PARENT_WIRE,
          schema: {
            type: 'object',
            properties: { name: { type: 'string' }, extra: { type: 'string' } },
          },
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await syncResourceDefinitions({
      aepbaseUrl: BASE,
      token: TOKEN,
      defs: [PARENT], // no `extra` → the PATCH drops it
      logger: SILENT_LOGGER,
      authorizedDrops: new Map([['parent', new Set(['extra'])]]),
    });

    const [, patchInit] = fetchMock.mock.calls[2];
    expect(patchInit.headers['X-Homestead-Authorized-Drops']).toBe('extra');
  });

  it('treats `user` as a built-in parent', async () => {
    const userChild: ResourceDefinition = {
      singular: 'pref',
      plural: 'prefs',
      parents: ['user'],
      fields: {},
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const result = await syncResourceDefinitions({
      aepbaseUrl: BASE,
      token: TOKEN,
      defs: [userChild],
      logger: SILENT_LOGGER,
    });

    expect(result.created).toEqual(['pref']);
  });

  it('throws on duplicate singulars', async () => {
    await expect(
      syncResourceDefinitions({
        aepbaseUrl: BASE,
        token: TOKEN,
        defs: [PARENT, PARENT],
        logger: SILENT_LOGGER,
      }),
    ).rejects.toThrow(/duplicate singular "parent"/);
  });

  it('throws on unknown parent references', async () => {
    const orphan: ResourceDefinition = {
      singular: 'orphan',
      plural: 'orphans',
      parents: ['ghost'],
      fields: {},
    };
    await expect(
      syncResourceDefinitions({
        aepbaseUrl: BASE,
        token: TOKEN,
        defs: [orphan],
        logger: SILENT_LOGGER,
      }),
    ).rejects.toThrow(/unknown parent\(s\): ghost/);
  });

  it('throws on parent cycles', async () => {
    const a: ResourceDefinition = {
      singular: 'a',
      plural: 'as',
      parents: ['b'],
      fields: {},
    };
    const b: ResourceDefinition = {
      singular: 'b',
      plural: 'bs',
      parents: ['a'],
      fields: {},
    };
    await expect(
      syncResourceDefinitions({
        aepbaseUrl: BASE,
        token: TOKEN,
        defs: [a, b],
        logger: SILENT_LOGGER,
      }),
    ).rejects.toThrow(/cycle detected/);
  });

  it('wraps per-resource errors with the singular', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response('boom', { status: 500 }),
    );

    await expect(
      syncResourceDefinitions({
        aepbaseUrl: BASE,
        token: TOKEN,
        defs: [PARENT],
        logger: SILENT_LOGGER,
      }),
    ).rejects.toThrow(/failed to sync "parent"/);
  });
});
