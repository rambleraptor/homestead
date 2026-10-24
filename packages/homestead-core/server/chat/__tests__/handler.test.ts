/**
 * The chat turn's tool set: the per-resource surface (one tool per resource,
 * custom methods in the action enum) plus document search when configured,
 * with every outcome recorded in order for the transcript.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { buildChatToolSet } from '../handler';
import type { ChatToolCall } from '../../../chat/types';
import type { ResourceDefinition } from '../../../resources/types';

vi.mock('../../ai/config', () => ({
  isAiConfigured: () => true,
  isEmbeddingConfigured: () => false,
}));

const GIFT_CARD: ResourceDefinition = {
  singular: 'gift-card',
  plural: 'gift-cards',
  fields: { merchant: { type: 'string', required: true }, balance: { type: 'number' } },
  customMethods: {
    redeem: {
      target: 'item',
      request: { type: 'object', required: ['amount'], properties: { amount: { type: 'number' } } },
      load: async () => ({ default: async () => new Response('{}') }),
    },
  },
};

const TRANSACTION: ResourceDefinition = {
  singular: 'transaction',
  plural: 'transactions',
  parents: ['gift-card'],
  fields: { amount: { type: 'number', required: true } },
};

let restoreFetch: (() => void) | undefined;
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

function stubFetch(body: string, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  restoreFetch = () => (globalThis.fetch = original);
  return calls;
}

const run = (tool: { execute?: unknown }, args: unknown) =>
  (tool.execute as (a: unknown, o: unknown) => Promise<unknown>)(args, {});

describe('buildChatToolSet', () => {
  it('hands the model one tool per resource, with custom methods in the action enum', () => {
    const { toolSet, hasDocSearch } = buildChatToolSet([GIFT_CARD, TRANSACTION], 'tok', () => {});
    expect(Object.keys(toolSet).sort()).toEqual(['gift_cards', 'transactions']);
    expect(hasDocSearch).toBe(false);

    const schema = toolSet.gift_cards.inputSchema as z.ZodObject;
    const action = schema.shape.action as z.ZodEnum<Record<string, string>>;
    expect(Object.values(action.enum)).toEqual([
      'list',
      'get',
      'create',
      'update',
      'delete',
      ':redeem',
    ]);
    expect(Object.keys(schema.shape)).toEqual(
      expect.arrayContaining(['filter', 'order_by', 'limit', 'fields', 'body']),
    );
  });

  it('records each outcome, in order, with the action the model chose', async () => {
    const recorded: ChatToolCall[] = [];
    const { toolSet } = buildChatToolSet([GIFT_CARD], 'tok', (c) => recorded.push(c));

    const calls = stubFetch('{"results":[{"id":"gc1"}]}');
    const ok = await run(toolSet.gift_cards, {
      action: 'list',
      filter: 'balance > 0',
      order_by: '-balance',
      limit: 1,
    });
    expect(ok).toEqual({
      result: { records: [{ id: 'gc1' }], count: 1, truncated: false },
    });
    const url = new URL(calls[0].url);
    expect(url.searchParams.get('filter')).toBe('balance > 0');
    expect(url.searchParams.get('order_by')).toBe('-balance');
    expect(url.searchParams.get('max_page_size')).toBe('1');
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer tok' });

    // A rejection the surface produces never reaches the engine and is fed
    // back to the model as a correctable error, not thrown.
    const bad = await run(toolSet.gift_cards, { action: 'update', id: 'gc1' });
    expect(bad).toEqual({ error: expect.stringMatching(/needs at least one field/) });
    expect(calls).toHaveLength(1);

    expect(recorded).toEqual([
      {
        tool: 'gift_cards',
        args: { action: 'list', filter: 'balance > 0', order_by: '-balance', limit: 1 },
        ok: true,
        result: { records: [{ id: 'gc1' }], count: 1, truncated: false },
      },
      {
        tool: 'gift_cards',
        args: { action: 'update', id: 'gc1' },
        ok: false,
        error: expect.stringMatching(/needs at least one field/),
      },
    ]);
  });

  it('dispatches a custom method through the gateway under the caller token', async () => {
    const { toolSet } = buildChatToolSet([GIFT_CARD], 'tok', () => {});
    const calls = stubFetch('{"balance":0}');
    const out = await run(toolSet.gift_cards, {
      action: ':redeem',
      id: 'gc1',
      body: { amount: 25 },
    });
    expect(out).toEqual({ result: { balance: 0 } });
    expect(calls[0].url).toMatch(/\/gift-cards\/gc1:redeem$/);
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ amount: 25 });
  });
});
