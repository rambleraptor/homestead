/**
 * MCP custom-method tools: the generated surface (names, params, descriptions)
 * and the gateway request each call turns into. The request is captured by
 * stubbing global `fetch` — `aepbaseFetch` goes over loopback, so this asserts
 * the exact URL/method/body an MCP call sends without needing a live engine.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import {
  buildCustomMethodTools,
  executeCustomMethod,
  type CustomMethodBinding,
} from '@rambleraptor/homestead-core/server/chat/custom-methods';

const noop = async () => ({ default: async () => new Response('{}') });

const DOCUMENTS: ResourceDefinition = {
  singular: 'document',
  plural: 'documents',
  fields: { title: { type: 'string' } },
  customMethods: {
    classify: {
      target: 'item',
      async: true,
      title: 'Classify document',
      load: noop,
    },
  },
};

const GROCERIES: ResourceDefinition = {
  singular: 'grocery',
  plural: 'groceries',
  fields: { name: { type: 'string' } },
  customMethods: {
    'send-notification': {
      target: 'collection',
      description: 'Notify the household about the grocery list.',
      request: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', description: 'Notification title.' },
          urgency: { type: 'string', enum: ['low', 'high'] },
          repeat: { type: 'integer' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      load: noop,
    },
  },
};

/** A child of the built-in `user` root, so calls carry a parent id. */
const SUBSCRIPTIONS: ResourceDefinition = {
  singular: 'notification-subscription',
  plural: 'notification-subscriptions',
  parents: ['user'],
  fields: { enabled: { type: 'boolean' } },
  customMethods: {
    'send-notification': { target: 'item', load: noop },
  },
};

const ALL = [DOCUMENTS, GROCERIES, SUBSCRIPTIONS];

/** The tool's params, with the required ones flagged. */
function params(schema: z.ZodTypeAny): Record<string, boolean> {
  const shape = (schema as z.ZodObject).shape;
  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) => [key, !value.safeParse(undefined).success]),
  );
}

/** Capture the single request the next `executeCustomMethod` call makes. */
function captureFetch(response = new Response('{"done":false}', { status: 202 })) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return response;
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

let restoreFetch: (() => void) | undefined;
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

async function invoke(
  name: string,
  args: Record<string, unknown>,
  bindings: Map<string, CustomMethodBinding>,
  response?: Response,
) {
  // A test can invoke multiple methods; restore the previous stub before replacing it.
  restoreFetch?.();
  const stub = captureFetch(response);
  restoreFetch = stub.restore;
  const out = await executeCustomMethod(name, args, bindings, 'tok');
  return { out, calls: stub.calls };
}

describe('buildCustomMethodTools', () => {
  it('names item methods after the singular and collection methods after the plural', () => {
    const { tools } = buildCustomMethodTools(ALL);
    expect(Object.keys(tools).sort()).toEqual([
      'classify_document',
      'send_notification_groceries',
      'send_notification_notification_subscription',
    ]);
  });

  it('takes the id for an item method and the parent id for a nested resource', () => {
    const { tools } = buildCustomMethodTools(ALL);
    expect(params(tools.classify_document.inputSchema)).toMatchObject({ id: true });
    expect(params(tools.send_notification_notification_subscription.inputSchema)).toMatchObject({
      user_id: true,
      id: true,
    });
  });

  it('turns a declared request schema into typed params, required-ness included', () => {
    const { tools } = buildCustomMethodTools(ALL);
    const schema = tools.send_notification_groceries.inputSchema as z.ZodObject;
    expect(params(schema)).toEqual({
      title: true,
      urgency: false,
      repeat: false,
      tags: false,
    });
    expect(schema.safeParse({ title: 'Milk', urgency: 'nope' }).success).toBe(false);
    expect(
      schema.safeParse({ title: 'Milk', urgency: 'high', repeat: 2, tags: ['a'] }).success,
    ).toBe(true);
  });

  it('offers a JSON-encoded body escape hatch only when no request schema is declared', () => {
    const { tools } = buildCustomMethodTools(ALL);
    // classify declares no request schema → an optional, opaque body param.
    expect(params(tools.classify_document.inputSchema)).toEqual({ id: true, body: false });
    // groceries:send-notification declares one → typed params, no escape hatch.
    expect(params(tools.send_notification_groceries.inputSchema)).not.toHaveProperty('body');
  });

  it('describes an async method as long-running and carries a declared description', () => {
    const { tools } = buildCustomMethodTools(ALL);
    expect(tools.classify_document.description).toContain('read_operation');
    expect(tools.send_notification_groceries.description).toContain(
      'Notify the household about the grocery list.',
    );
    expect(tools.send_notification_groceries.description).not.toContain('read_operation');
    expect(tools.send_notification_notification_subscription.description).toContain(
      'Nested under: users',
    );
  });

  it('skips a method whose tool name is already taken', () => {
    const { tools, bindings } = buildCustomMethodTools(ALL, new Set(['classify_document']));
    expect(tools).not.toHaveProperty('classify_document');
    expect(bindings.has('classify_document')).toBe(false);
    expect(tools).toHaveProperty('send_notification_groceries');
  });
});

describe('executeCustomMethod', () => {
  it('POSTs the item path with the caller token and returns the parsed body', async () => {
    const { bindings } = buildCustomMethodTools(ALL);
    const { out, calls } = await invoke('classify_document', { id: 'doc1' }, bindings);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/documents\/doc1:classify$/);
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    // No declared schema and no body arg → a bare POST, as handlers expect.
    expect(calls[0].init.body).toBeUndefined();
    expect(out).toEqual({ ok: true, result: { done: false } });
  });

  it('builds the parent chain into the path', async () => {
    const { bindings } = buildCustomMethodTools(ALL);
    const { calls } = await invoke(
      'send_notification_notification_subscription',
      { user_id: 'u1', id: 'sub1' },
      bindings,
    );
    expect(calls[0].url).toMatch(
      /\/users\/u1\/notification-subscriptions\/sub1:send-notification$/,
    );
  });

  it('sends only the declared fields the caller supplied', async () => {
    const { bindings } = buildCustomMethodTools(ALL);
    const { calls } = await invoke(
      'send_notification_groceries',
      { title: 'Milk', urgency: 'high', bogus: 'x' },
      bindings,
    );
    expect(calls[0].url).toMatch(/\/groceries:send-notification$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      title: 'Milk',
      urgency: 'high',
    });
  });

  it('parses the free-form body param and rejects invalid JSON', async () => {
    const { bindings } = buildCustomMethodTools([
      { ...DOCUMENTS, customMethods: { reembed: { target: 'collection', load: noop } } },
    ]);
    const { calls } = await invoke('reembed_documents', { body: '{"force":true}' }, bindings);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ force: true });

    const bad = await invoke('reembed_documents', { body: 'not json' }, bindings);
    expect(bad.out).toEqual({ ok: false, error: 'parameter "body" must be a valid JSON string' });
    expect(bad.calls).toHaveLength(0);
  });

  it('reports a missing id and an unknown tool as errors instead of throwing', async () => {
    const { bindings } = buildCustomMethodTools(ALL);
    const missing = await invoke('classify_document', {}, bindings);
    expect(missing.out).toEqual({ ok: false, error: 'missing required parameter "id"' });
    const unknown = await executeCustomMethod('nope', {}, bindings, 'tok');
    expect(unknown).toEqual({ ok: false, error: 'unknown tool "nope"' });
  });

  it('surfaces a failing method as a structured error carrying the status', async () => {
    const { bindings } = buildCustomMethodTools(ALL);
    const { out } = await invoke(
      'classify_document',
      { id: 'doc1' },
      bindings,
      new Response('{"error":"not found"}', { status: 404 }),
    );
    expect(out.ok).toBe(false);
    expect((out as { error: string }).error).toContain('documents:classify failed (404)');
    expect((out as { error: string }).error).toContain('not found');
  });
});

// ───────────────────────── files and bulk import ─────────────────────────

const UPLOAD = {
  type: 'object',
  properties: { $upload: { type: 'string' } },
  required: ['$upload'],
  'x-homestead-upload': true,
};

const PHOTOS: ResourceDefinition = {
  singular: 'photo',
  plural: 'photos',
  fields: { name: { type: 'string' } },
  customMethods: {
    read: {
      description: 'Read a photo.',
      request: { type: 'object', properties: { image: UPLOAD }, required: ['image'] },
      load: noop,
    },
    album: {
      request: {
        type: 'object',
        properties: { title: { type: 'string' }, pages: { type: 'array', items: UPLOAD } },
      },
      load: noop,
    },
  },
};

const RECIPES: ResourceDefinition = {
  singular: 'recipe',
  plural: 'recipes',
  fields: { title: { type: 'string' } },
  bulkImport: {
    formats: [
      { id: 'text', label: 'Text', inputType: 'text', load: async () => ({ default: { parse: () => [] } }) },
      { id: 'photos', label: 'Photos', inputType: 'file', multiple: true, load: async () => ({ default: { parse: () => [] } }) },
    ],
  },
};

/** Answer each request in turn from `responses`, recording them. */
function sequenceFetch(responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return responses.shift() ?? new Response('{}');
  }) as typeof fetch;
  restoreFetch = () => (globalThis.fetch = original);
  return calls;
}

const attachments = async (id: string) => new File([`bytes of ${id}`], `${id}.png`, { type: 'image/png' });

describe('custom methods that take files', () => {
  it('take attachment ids where the surface has attachments', () => {
    const { tools } = buildCustomMethodTools([PHOTOS], undefined, { files: true });
    expect(params(tools.read_photos.inputSchema)).toEqual({ image: true });
    const image = (tools.read_photos.inputSchema as z.ZodObject).shape.image;
    expect(image.description).toMatch(/attachment id/);
    expect(params(tools.album_photos.inputSchema)).toEqual({ title: false, pages: false });
  });

  it('without attachments, drop an optional file field and skip a required one', () => {
    const { tools } = buildCustomMethodTools([PHOTOS]);
    expect(tools).not.toHaveProperty('read_photos');
    expect(params(tools.album_photos.inputSchema)).toEqual({ title: false });
  });

  it('send the attached files as multipart $upload parts', async () => {
    const { bindings } = buildCustomMethodTools([PHOTOS], undefined, { files: true });
    const calls = sequenceFetch([new Response('{"items":[]}')]);
    const out = await executeCustomMethod('album_photos', { title: 'Trip', pages: ['a1', 'a2'] }, bindings, 'tok', {
      attachments,
    });
    expect(out.ok).toBe(true);
    const form = calls[0]!.init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(JSON.parse(form.get('body') as string)).toEqual({
      title: 'Trip',
      pages: [{ $upload: '$upload-0' }, { $upload: '$upload-1' }],
    });
    expect((form.get('$upload-1') as File).name).toBe('a2.png');
  });

  it('refuse attachment ids where there is nothing to resolve them', async () => {
    const { bindings } = buildCustomMethodTools([PHOTOS], undefined, { files: true });
    sequenceFetch([]);
    const out = await executeCustomMethod('read_photos', { image: 'a1' }, bindings, 'tok');
    expect(out).toEqual({ ok: false, error: '"image" takes files, which can only be attached in the chat' });
  });
});

describe('bulk import as a tool', () => {
  it('is offered from the bulkImport declaration, with the standard body', () => {
    const { tools } = buildCustomMethodTools([RECIPES], undefined, { files: true });
    const shape = (tools.bulk_import_recipes.inputSchema as z.ZodObject).shape;
    expect(Object.keys(shape).sort()).toEqual(
      ['files', 'format', 'preview_id', 'selected_indices', 'text', 'validate_only'].sort(),
    );
    expect(shape.format.safeParse('photos').success).toBe(true);
    expect(shape.format.safeParse('nope').success).toBe(false);
    expect(shape.selected_indices.safeParse([0, 2]).success).toBe(true);
    expect(shape.selected_indices.safeParse('*').success).toBe(true);
    expect(tools.bulk_import_recipes.description).toContain('validate_only');
  });

  it('leaves files out on a surface without attachments', () => {
    const { tools } = buildCustomMethodTools([RECIPES]);
    expect((tools.bulk_import_recipes.inputSchema as z.ZodObject).shape).not.toHaveProperty('files');
  });

  it('waits for the operation and labels the preview as untrusted', async () => {
    const { bindings } = buildCustomMethodTools([RECIPES], undefined, { files: true });
    const preview = { validate_only: true, preview_id: 'p1', items: [], summary: { total: 0, valid: 0, invalid: 0 } };
    const calls = sequenceFetch([
      new Response('{"id":"op1","done":false}', { status: 202 }),
      new Response('{"id":"op1","done":false}'),
      new Response(JSON.stringify({ id: 'op1', done: true, response: preview })),
    ]);
    const out = await executeCustomMethod(
      'bulk_import_recipes',
      { format: 'text', text: 'https://www.tiktok.com/@a/video/1', validate_only: true },
      bindings,
      'tok',
    );
    expect(calls.map((c) => c.url.replace(/^.*\/api\/aep/, ''))).toEqual([
      '/recipes:bulk-import',
      '/operations/op1',
      '/operations/op1',
    ]);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      format: 'text',
      text: 'https://www.tiktok.com/@a/video/1',
      validate_only: true,
    });
    expect(out).toEqual({
      ok: true,
      result: { untrusted: true, source: expect.stringContaining('recipes parsed'), content: preview },
    });
  });

  it("reports a failed operation's problem detail", async () => {
    const { bindings } = buildCustomMethodTools([RECIPES]);
    sequenceFetch([
      new Response('{"id":"op1","done":false}', { status: 202 }),
      new Response(JSON.stringify({ id: 'op1', done: true, error: { status: 410, detail: 'preview expired' } })),
    ]);
    const out = await executeCustomMethod('bulk_import_recipes', { format: 'text', preview_id: 'p1' }, bindings, 'tok');
    expect(out).toEqual({ ok: false, error: 'operation op1 failed: preview expired' });
  });
});
