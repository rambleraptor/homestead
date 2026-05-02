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
  schema: {
    type: 'object',
    properties: { value: { type: 'string' } },
  },
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
      new Response(JSON.stringify(PARENT), { status: 200 }),
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
          ...PARENT,
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
  });

  it('treats `user` as a built-in parent', async () => {
    const userChild: ResourceDefinition = {
      singular: 'pref',
      plural: 'prefs',
      parents: ['user'],
      schema: { type: 'object', properties: {} },
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
      schema: { type: 'object', properties: {} },
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
      schema: { type: 'object', properties: {} },
    };
    const b: ResourceDefinition = {
      singular: 'b',
      plural: 'bs',
      parents: ['a'],
      schema: { type: 'object', properties: {} },
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
