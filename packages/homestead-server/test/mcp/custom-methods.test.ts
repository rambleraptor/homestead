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
} from '../../src/mcp/custom-methods';

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
