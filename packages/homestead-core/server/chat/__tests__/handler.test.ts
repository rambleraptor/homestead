/**
 * The chat turn's tool set: the per-resource surface (one tool per resource,
 * custom methods in the action enum) plus document search when configured.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { buildChatToolSet, confirmActions } from '../handler';
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

const GIFT_CARD_WITH_IMAGE: ResourceDefinition = {
  singular: 'gift-card',
  plural: 'gift-cards',
  fields: { merchant: { type: 'string', required: true }, front_image: { type: 'file' } },
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
    const { toolSet, hasDocSearch } = buildChatToolSet([GIFT_CARD, TRANSACTION], 'tok');
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

  it('runs the action the model chose under the caller token, and returns failures as errors', async () => {
    const { toolSet } = buildChatToolSet([GIFT_CARD], 'tok');

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
  });

  it("fills a file field from the conversation's attachments, and only from them", async () => {
    const photo = new File([new Uint8Array([1, 2, 3])], 'card.png', { type: 'image/png' });
    const { toolSet } = buildChatToolSet([GIFT_CARD_WITH_IMAGE], 'tok', {
      attachments: async (id) => {
        if (id !== 'f1') throw new Error(`no attachment "${id}" in this conversation`);
        return photo;
      },
    });
    const calls = stubFetch('{"id":"gc1"}', 201);
    const ok = await run(toolSet.gift_cards, {
      action: 'create',
      fields: { merchant: 'REI', front_image: 'f1' },
    });
    expect(ok).toEqual({ result: { id: 'gc1' } });
    const body = calls[0].init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('merchant')).toBe('REI');
    expect(await (body.get('front_image') as File).text()).toBe('\u0001\u0002\u0003');

    const bad = await run(toolSet.gift_cards, {
      action: 'create',
      fields: { merchant: 'REI', front_image: 'elsewhere' },
    });
    expect(bad).toEqual({ error: 'no attachment "elsewhere" in this conversation' });
    expect(calls).toHaveLength(1);
  });

  it('dispatches a custom method through the gateway under the caller token', async () => {
    const { toolSet } = buildChatToolSet([GIFT_CARD], 'tok');
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

describe('confirm methods', () => {
  const load = async () => ({ default: async () => new Response() });
  const INBOX: ResourceDefinition = {
    singular: 'notification',
    plural: 'notifications',
    parents: ['user'],
    fields: { title: { type: 'string' } },
    customMethods: { send: { confirm: true, load }, archive: { load } },
  };

  it('are the actions that ask first, by tool', () => {
    expect(confirmActions([INBOX, GIFT_CARD])).toEqual(new Map([['notifications', new Set([':send'])]]));
  });

  it("make the tool need approval for that action only", async () => {
    const { toolSet } = buildChatToolSet([INBOX], 't');
    const needs = toolSet.notifications!.needsApproval as (input: unknown) => boolean;
    expect(needs({ action: ':send' })).toBe(true);
    expect(needs({ action: ':archive' })).toBe(false);
    expect(needs({ action: 'list' })).toBe(false);
    expect(buildChatToolSet([GIFT_CARD], 't').toolSet.gift_cards!.needsApproval).toBeUndefined();
  });
});
