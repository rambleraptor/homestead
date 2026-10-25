/**
 * Tests for the app-flags schema syncer.
 *
 * The syncer is pure HTTP against aepbase's resource-definition API,
 * so these mock `fetch` directly and assert the request sequence.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildResourceSchema } from '@rambleraptor/homestead-core/settings/flags';
import { syncAppFlagsSchema } from '../sync';
import type { AppFlagDefs } from '@rambleraptor/homestead-core/settings/flags';

const defs: AppFlagDefs = {
  settings: {
    theme: {
      type: 'enum',
      label: 'Theme',
      description: 'Color theme for the app.',
      options: ['light', 'dark'],
      default: 'light',
    },
  },
};

const BASE = 'http://aepbase.test';
const TOKEN = 'admin-token';
const SILENT_LOGGER = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('syncAppFlagsSchema', () => {
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

  it('creates the resource definition when none exists', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('not found', { status: 404 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200 }),
    );

    const result = await syncAppFlagsSchema({
      aepbaseUrl: BASE,
      token: TOKEN,
      defs,
      logger: SILENT_LOGGER,
    });

    expect(result.action).toBe('created');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [postUrl, postInit] = fetchMock.mock.calls[1];
    expect(postUrl).toBe(`${BASE}/aep-resource-definitions?id=app-flag`);
    expect(postInit.method).toBe('POST');
    const body = JSON.parse(postInit.body as string);
    expect(body.singular).toBe('app-flag');
    expect(body.plural).toBe('app-flags');
    expect(body.schema.properties.settings__theme.type).toBe('string');
  });

  it('is a no-op when the existing schema already matches', async () => {
    // What a previous boot would have registered: every flag and its audience.
    const existingSchema = buildResourceSchema(defs);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          singular: 'app-flag',
          schema: existingSchema,
        }),
        { status: 200 },
      ),
    );

    const result = await syncAppFlagsSchema({
      aepbaseUrl: BASE,
      token: TOKEN,
      defs,
      logger: SILENT_LOGGER,
    });

    expect(result.action).toBe('noop');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [getUrl] = fetchMock.mock.calls[0];
    expect(getUrl).toBe(`${BASE}/aep-resource-definitions/app-flag`);
  });

  it('PATCHes the resource definition when the schema has drifted', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          singular: 'app-flag',
          schema: {
            type: 'object',
            properties: { old_field: { type: 'string' } },
          },
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const result = await syncAppFlagsSchema({
      aepbaseUrl: BASE,
      token: TOKEN,
      defs,
      logger: SILENT_LOGGER,
    });

    expect(result.action).toBe('updated');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [patchUrl, patchInit] = fetchMock.mock.calls[1];
    expect(patchUrl).toBe(`${BASE}/aep-resource-definitions/app-flag`);
    expect(patchInit.method).toBe('PATCH');
    expect(patchInit.headers['Content-Type']).toBe(
      'application/merge-patch+json',
    );
    const patchBody = JSON.parse(patchInit.body as string);
    expect(patchBody.schema.properties.settings__theme).toBeDefined();
  });

  it('throws when aepbase returns an unexpected status on GET', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('boom', { status: 500 }),
    );

    await expect(
      syncAppFlagsSchema({
        aepbaseUrl: BASE,
        token: TOKEN,
        defs,
        logger: SILENT_LOGGER,
      }),
    ).rejects.toThrow(/500/);
  });

  describe('authorized drops', () => {
    /**
     * The generated schema's columns come from declared app flags, so removing a
     * declaration *is* a column drop — and the engine refuses a populated one
     * unless the PATCH says otherwise. Without this header the whole PATCH
     * throws before any DDL, so nothing in it applies (including columns other
     * apps added in the same boot) and the resource's schema silently freezes.
     */
    it('sends the header when a drop is authorized', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ schema: { type: 'object', properties: {} } }), {
          status: 200,
        }),
      );
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await syncAppFlagsSchema({
        aepbaseUrl: BASE,
        token: TOKEN,
        defs,
        logger: SILENT_LOGGER,
        authorizedDrops: new Set(['gift_cards__show_archived', 'other__gone']),
      });

      const [, patchInit] = fetchMock.mock.calls[1];
      expect(patchInit.method).toBe('PATCH');
      expect(patchInit.headers['X-Homestead-Authorized-Drops']).toBe(
        'gift_cards__show_archived,other__gone',
      );
    });

    it('omits the header when nothing is authorized', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ schema: { type: 'object', properties: {} } }), {
          status: 200,
        }),
      );
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await syncAppFlagsSchema({
        aepbaseUrl: BASE,
        token: TOKEN,
        defs,
        logger: SILENT_LOGGER,
      });

      // Absent means "refuse a populated drop", which is the safe default.
      const [, patchInit] = fetchMock.mock.calls[1];
      expect(patchInit.headers).not.toHaveProperty('X-Homestead-Authorized-Drops');
    });

    it('omits the header for an empty set', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ schema: { type: 'object', properties: {} } }), {
          status: 200,
        }),
      );
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await syncAppFlagsSchema({
        aepbaseUrl: BASE,
        token: TOKEN,
        defs,
        logger: SILENT_LOGGER,
        authorizedDrops: new Set<string>(),
      });

      const [, patchInit] = fetchMock.mock.calls[1];
      expect(patchInit.headers).not.toHaveProperty('X-Homestead-Authorized-Drops');
    });

    it('still carries the auth and content-type headers alongside it', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ schema: { type: 'object', properties: {} } }), {
          status: 200,
        }),
      );
      fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await syncAppFlagsSchema({
        aepbaseUrl: BASE,
        token: TOKEN,
        defs,
        logger: SILENT_LOGGER,
        authorizedDrops: new Set(['gift_cards__show_archived']),
      });

      const [, patchInit] = fetchMock.mock.calls[1];
      expect(patchInit.headers).toMatchObject({
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/merge-patch+json',
      });
    });
  });
});
