/**
 * The per-resource MCP tool surface: one tool per resource with the verb as an
 * `action` parameter.
 *
 * Three things are worth pinning here, because they are what the surface trades
 * for its tool count. First, the per-resource *typing* it keeps that `generic`
 * gives up — a resource's real field schemas, its parent ids as required
 * params, its custom methods in the action enum. Second, the requiredness that
 * moves out of JSON Schema and into the executor, which has to reject with a
 * message naming what was accepted. Third, that a call still lands on the
 * engine as exactly the request the typed surface would have made — asserted
 * against a stubbed global `fetch`, and compared directly with the typed
 * surface's own request rather than to a hand-written expectation.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { buildTools } from '@rambleraptor/homestead-core/server/chat/tools';
import { executeToolCall } from '@rambleraptor/homestead-core/server/chat/execute';
import { buildResourceTools, resourceInstructions } from '@rambleraptor/homestead-core/server/chat/per-resource';

const GIFT_CARD: ResourceDefinition = {
  singular: 'gift-card',
  plural: 'gift-cards',
  description: 'A gift card you hold.',
  fields: {
    merchant: { type: 'string', required: true },
    balance: { type: 'number' },
    status: { type: 'string', enum: ['active', 'spent'] },
    owner: { type: 'string', reference: { resource: 'user' } },
    receipt: { type: 'file' },
    legacy_code: { type: 'string', deprecated: true },
  },
  customMethods: {
    redeem: {
      target: 'item',
      description: 'Mark the card as spent.',
      request: { type: 'object', required: ['amount'], properties: { amount: { type: 'number' } } },
      load: async () => ({ default: async () => new Response('{}') }),
    },
    'top-up': {
      target: 'collection',
      method: 'GET',
      load: async () => ({ default: async () => new Response('{}') }),
    },
  },
};

const TRANSACTION: ResourceDefinition = {
  singular: 'transaction',
  plural: 'transactions',
  parents: ['gift-card'],
  fields: { amount: { type: 'number', required: true }, notes: { type: 'string' } },
};

const DEFS = [GIFT_CARD, TRANSACTION];

/** Capture the requests the surface makes, and what to answer them with. */
function captureFetch(response = new Response('{"path":"/gift-cards/abc"}')) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return response.clone();
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

let restoreFetch: (() => void) | undefined;
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

function stubFetch(response?: Response) {
  const stub = captureFetch(response);
  restoreFetch = stub.restore;
  return stub;
}

const shapeOf = (schema: unknown) => (schema as z.ZodObject).shape;
const errorOf = (out: unknown) => (out as { error: string }).error;

describe('the per-resource tool surface', () => {
  it('is one tool per resource, named for the resource', () => {
    const { tools } = buildResourceTools(DEFS);
    expect(Object.keys(tools).sort()).toEqual(['gift_cards', 'transactions']);
  });

  it('takes the verb as an action enum, with custom methods in AEP notation', () => {
    const { tools } = buildResourceTools(DEFS);
    const action = shapeOf(tools.gift_cards.inputSchema).action;
    for (const value of ['list', 'get', 'create', 'update', 'delete', ':redeem', ':top-up']) {
      expect(action.safeParse(value).success).toBe(true);
    }
    // A verb the resource doesn't declare can't even be sent.
    expect(action.safeParse(':incinerate').success).toBe(false);
    // And the colon means a custom method can never shadow a CRUD action.
    expect(action.safeParse('redeem').success).toBe(false);
  });

  it('carries the resource’s real field schemas, typed', () => {
    const { tools } = buildResourceTools(DEFS);
    const fields = shapeOf(shapeOf(tools.gift_cards.inputSchema).fields.unwrap());

    expect(fields.merchant.safeParse('Target').success).toBe(true);
    expect(fields.balance.safeParse(25).success).toBe(true);
    expect(fields.balance.safeParse('twenty-five').success).toBe(false);
    // An enum field rejects a value outside it, in the schema rather than later.
    expect(fields.status.safeParse('active').success).toBe(true);
    expect(fields.status.safeParse('melted').success).toBe(false);
    // A reference field tells the model whose id it holds. The note sits on the
    // inner schema, since `fields` makes every property optional around it.
    expect(fields.owner.unwrap().description).toContain('id of a user record');
  });

  it('offers neither file fields nor deprecated ones', () => {
    const { tools } = buildResourceTools(DEFS);
    const fields = shapeOf(shapeOf(tools.gift_cards.inputSchema).fields.unwrap());
    expect(fields).not.toHaveProperty('receipt');
    expect(fields).not.toHaveProperty('legacy_code');
  });

  it('states what the schema cannot: required fields and custom methods', () => {
    const { tools } = buildResourceTools(DEFS);
    const { description } = tools.gift_cards;
    expect(description).toContain('A gift card you hold.');
    expect(description).toContain('create requires: merchant');
    expect(description).toContain(':redeem (needs id; body: amount) — Mark the card as spent.');
  });

  it('requires the ancestor ids of a nested resource for every action', () => {
    const { tools } = buildResourceTools(DEFS);
    const shape = shapeOf(tools.transactions.inputSchema);
    // Required, not optional — listing a nested collection needs the path too.
    expect(shape.gift_card_id.safeParse(undefined).success).toBe(false);
    expect(shape.gift_card_id.safeParse('gc1').success).toBe(true);
    expect(tools.transactions.description).toContain('Nested under gift-cards');
    // A top-level resource has no such param.
    expect(shapeOf(tools.gift_cards.inputSchema)).not.toHaveProperty('gift_card_id');
  });

  it('omits `body` from a resource with no custom methods', () => {
    const { tools } = buildResourceTools(DEFS);
    expect(shapeOf(tools.gift_cards.inputSchema)).toHaveProperty('body');
    expect(shapeOf(tools.transactions.inputSchema)).not.toHaveProperty('body');
  });
});

describe('reference hints', () => {
  it('name this surface’s tool for the target, not the typed read_<x>', () => {
    const person: ResourceDefinition = {
      singular: 'person',
      plural: 'people',
      fields: { name: { type: 'string' } },
    };
    const game: ResourceDefinition = {
      singular: 'game',
      plural: 'games',
      fields: { host: { type: 'string', reference: { resource: 'person' } } },
    };
    const { tools } = buildResourceTools([person, game]);
    const fields = shapeOf(tools.games.inputSchema).fields as z.ZodOptional<z.ZodObject>;
    const host = fields.unwrap().shape.host as z.ZodOptional<z.ZodTypeAny>;
    const description = host.unwrap().description ?? host.description ?? '';
    expect(description).toContain('use the people tool\'s "list" action to find one');
    expect(description).not.toContain('read_person');
  });
});

describe('a read-only authorization', () => {
  it('keeps every tool but narrows the action enum, so the limit is visible', () => {
    const { tools } = buildResourceTools(DEFS, { write: false });
    // The tool *is* the resource, so it can't be withheld the way a write tool
    // can — the enum is what narrows.
    expect(Object.keys(tools).sort()).toEqual(['gift_cards', 'transactions']);

    const action = shapeOf(tools.gift_cards.inputSchema).action;
    expect(action.safeParse('list').success).toBe(true);
    expect(action.safeParse('get').success).toBe(true);
    for (const value of ['create', 'update', 'delete']) {
      expect(action.safeParse(value).success).toBe(false);
    }
    expect(tools.gift_cards.description).toContain('read-only');
  });

  it('keeps GET custom methods and drops the rest', () => {
    const { tools } = buildResourceTools(DEFS, { write: false });
    const action = shapeOf(tools.gift_cards.inputSchema).action;
    expect(action.safeParse(':top-up').success).toBe(true);
    expect(action.safeParse(':redeem').success).toBe(false);
  });

  it('refuses a write that got past the schema', async () => {
    const { execute } = buildResourceTools(DEFS, { write: false });
    const { calls } = stubFetch();
    const out = await execute(
      'gift_cards',
      { action: 'create', fields: { merchant: 'Target' } },
      'tok',
    );
    expect(out.ok).toBe(false);
    expect(errorOf(out)).toContain('it has: list, get, :top-up');
    expect(calls).toHaveLength(0);
  });
});

describe('executing a call', () => {
  it('lists without an id and gets one record with it', async () => {
    const { execute } = buildResourceTools(DEFS);

    const list = stubFetch(new Response('{"results":[]}'));
    const out = await execute('gift_cards', { action: 'list' }, 'tok');
    expect(list.calls[0].url).toMatch(/\/gift-cards(\?|$)/);
    expect(out).toEqual({ ok: true, result: { records: [], count: 0, truncated: false } });
    list.restore();

    const single = stubFetch();
    await execute('gift_cards', { action: 'get', id: 'abc' }, 'tok');
    expect(single.calls[0].url).toMatch(/\/gift-cards\/abc$/);
  });

  it('narrows, sorts and caps a list server-side', async () => {
    const { execute } = buildResourceTools(DEFS);
    const { calls } = stubFetch(new Response('{"results":[],"next_page_token":"more"}'));
    const out = await execute(
      'gift_cards',
      { action: 'list', filter: 'status == "active"', order_by: '-balance', limit: 3 },
      'tok',
    );
    const url = new URL(calls[0].url);
    expect(url.pathname).toMatch(/\/gift-cards$/);
    expect(url.searchParams.get('filter')).toBe('status == "active"');
    expect(url.searchParams.get('order_by')).toBe('-balance');
    expect(url.searchParams.get('max_page_size')).toBe('3');
    // A next-page token from the engine is reported as truncation the model can act on.
    expect(out).toMatchObject({ ok: true, result: { truncated: true, count: 0 } });
    expect((out as { result: { note: string } }).result.note).toMatch(/filter/);
  });

  it('rejects a limit outside 1–100 before it reaches the engine', async () => {
    const { execute } = buildResourceTools(DEFS);
    const { calls } = stubFetch();
    const out = await execute('gift_cards', { action: 'list', limit: 500 }, 'tok');
    expect(out.ok).toBe(false);
    expect(errorOf(out)).toMatch(/limit/);
    expect(calls).toHaveLength(0);
  });

  it('drops list options on get rather than sending them along', async () => {
    const { execute } = buildResourceTools(DEFS);
    const { calls } = stubFetch();
    await execute('gift_cards', { action: 'get', id: 'abc', filter: 'x == 1', limit: 5 }, 'tok');
    expect(calls[0].url).toMatch(/\/gift-cards\/abc$/);
  });

  it('ignores a stray id on list rather than silently fetching one record', async () => {
    const { execute } = buildResourceTools(DEFS);
    const { calls } = stubFetch(new Response('{"results":[]}'));
    await execute('gift_cards', { action: 'list', id: 'abc' }, 'tok');
    expect(calls[0].url).toMatch(/\/gift-cards(\?|$)/);
  });

  it('creates, merge-patches, and deletes', async () => {
    const { execute } = buildResourceTools(DEFS);

    const create = stubFetch();
    await execute(
      'gift_cards',
      { action: 'create', fields: { merchant: 'Target', balance: 25 } },
      'tok',
    );
    expect(create.calls[0].init.method).toBe('POST');
    expect(JSON.parse(create.calls[0].init.body as string)).toEqual({
      merchant: 'Target',
      balance: 25,
    });
    create.restore();

    const patch = stubFetch();
    await execute('gift_cards', { action: 'update', id: 'abc', fields: { balance: 10 } }, 'tok');
    expect(patch.calls[0].init.method).toBe('PATCH');
    expect(JSON.parse(patch.calls[0].init.body as string)).toEqual({ balance: 10 });
    patch.restore();

    const del = stubFetch(new Response(null, { status: 204 }));
    const out = await execute('gift_cards', { action: 'delete', id: 'abc' }, 'tok');
    expect(del.calls[0].init.method).toBe('DELETE');
    expect(out).toEqual({ ok: true, result: { deleted: true, id: 'abc' } });
  });

  it('nests a child call under its parent path', async () => {
    const { execute } = buildResourceTools(DEFS);
    const { calls } = stubFetch();
    await execute(
      'transactions',
      { action: 'create', gift_card_id: 'gc1', fields: { amount: 5 } },
      'tok',
    );
    expect(calls[0].url).toMatch(/\/gift-cards\/gc1\/transactions$/);
  });

  it('dispatches a custom method with its body', async () => {
    const { execute } = buildResourceTools(DEFS);
    const { calls } = stubFetch();
    const out = await execute(
      'gift_cards',
      { action: ':redeem', id: 'gc1', body: { amount: 25 } },
      'tok',
    );
    expect(out.ok).toBe(true);
    expect(calls[0].url).toMatch(/\/gift-cards\/gc1:redeem$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ amount: 25 });
  });

  it('makes the same request the typed surface would have made', async () => {
    // The point of translating rather than reimplementing: both surfaces have
    // to reach the engine identically, or permissions and validation could
    // diverge between them.
    const cases: Array<[Record<string, unknown>, string, Record<string, unknown>]> = [
      [
        { action: 'create', fields: { merchant: 'Target', balance: 25 } },
        'create_gift_card',
        { merchant: 'Target', balance: 25 },
      ],
      [
        { action: 'update', id: 'abc', fields: { status: 'spent' } },
        'update_gift_card',
        { id: 'abc', status: 'spent' },
      ],
      [{ action: 'get', id: 'abc' }, 'read_gift_card', { id: 'abc' }],
      [{ action: 'delete', id: 'abc' }, 'delete_gift_card', { id: 'abc' }],
    ];

    for (const [args, typedName, typedArgs] of cases) {
      const { execute } = buildResourceTools(DEFS);
      const mine = stubFetch();
      await execute('gift_cards', args, 'tok');
      const viaSurface = mine.calls.map((c) => [c.url, c.init.method, c.init.body]);
      mine.restore();

      const { bindings } = buildTools(DEFS);
      const theirs = stubFetch();
      await executeToolCall({ name: typedName, args: typedArgs }, bindings, 'tok');
      const viaTyped = theirs.calls.map((c) => [c.url, c.init.method, c.init.body]);
      theirs.restore();

      expect(viaSurface).toEqual(viaTyped);
    }
  });
});

describe('rejections name what was accepted', () => {
  it('rejects an action the resource does not have', async () => {
    const { execute } = buildResourceTools(DEFS);
    const out = await execute('gift_cards', { action: 'incinerate' }, 'tok');
    expect(out.ok).toBe(false);
    expect(errorOf(out)).toContain('it has: list, get, create, update, delete, :redeem, :top-up');
  });

  it('says which actions need an id', async () => {
    const { execute } = buildResourceTools(DEFS);
    for (const action of ['get', 'update', 'delete']) {
      const out = await execute('gift_cards', { action, fields: { balance: 1 } }, 'tok');
      expect(out.ok).toBe(false);
      expect(errorOf(out)).toBe(`gift-cards: action "${action}" needs "id"`);
    }
  });

  it('names the missing required fields on a create', async () => {
    const { execute } = buildResourceTools(DEFS);
    const { calls } = stubFetch();
    const out = await execute('gift_cards', { action: 'create', fields: { balance: 5 } }, 'tok');
    expect(out.ok).toBe(false);
    expect(errorOf(out)).toBe(
      'gift-cards: create is missing required field merchant — it accepts:' +
        ' merchant, balance, status, owner',
    );
    expect(calls).toHaveLength(0);
  });

  it('refuses an empty merge patch rather than sending a no-op', async () => {
    const { execute } = buildResourceTools(DEFS);
    const { calls } = stubFetch();
    const out = await execute('gift_cards', { action: 'update', id: 'abc' }, 'tok');
    expect(out.ok).toBe(false);
    expect(errorOf(out)).toContain('needs at least one field');
    expect(calls).toHaveLength(0);
  });

  it('names the accepted fields when one is invented', async () => {
    const { execute } = buildResourceTools(DEFS);
    const out = await execute(
      'gift_cards',
      { action: 'create', fields: { merchant: 'Target', vendor: 'Target' } },
      'tok',
    );
    expect(out.ok).toBe(false);
    expect(errorOf(out)).toBe(
      'unknown field "vendor" on gift-cards — it accepts: merchant, balance, status, owner',
    );
  });

  it('type-checks a field value before it reaches the engine', async () => {
    const { execute } = buildResourceTools(DEFS);
    const { calls } = stubFetch();
    const out = await execute(
      'gift_cards',
      { action: 'create', fields: { merchant: 'Target', status: 'melted' } },
      'tok',
    );
    expect(out.ok).toBe(false);
    expect(errorOf(out)).toContain('status');
    expect(calls).toHaveLength(0);
  });

  it('names a missing ancestor id plainly', async () => {
    const { execute } = buildResourceTools(DEFS);
    const out = await execute('transactions', { action: 'list' }, 'tok');
    expect(out).toEqual({
      ok: false,
      error: 'transactions: missing required parameter "gift_card_id"',
    });
  });

  it('rejects a custom method body that misses a declared field', async () => {
    const { execute } = buildResourceTools(DEFS);
    const { calls } = stubFetch();
    const out = await execute('gift_cards', { action: ':redeem', id: 'gc1', body: {} }, 'tok');
    expect(out.ok).toBe(false);
    expect(errorOf(out)).toContain('amount');
    expect(calls).toHaveLength(0);
  });

  it('needs an id for an item-target custom method', async () => {
    const { execute } = buildResourceTools(DEFS);
    const out = await execute('gift_cards', { action: ':redeem', body: { amount: 1 } }, 'tok');
    expect(out).toEqual({ ok: false, error: 'gift-cards: action ":redeem" needs "id"' });
  });
});

describe('resourceInstructions', () => {
  it('explains the calling convention rather than listing a catalog', () => {
    const instructions = resourceInstructions();
    // The tool names already name the resources, so no catalog is needed.
    expect(instructions).toContain('`action` parameter');
    expect(instructions).toContain('`<parent>_id`');
    expect(instructions).toContain(':like-this');
  });
});

describe('the tool budget', () => {
  it('emits each resource’s field set once, where typed emits it twice', () => {
    const { tools: mine } = buildResourceTools(DEFS);
    const { tools: typed } = buildTools(DEFS);

    // One tool per resource, versus four plus one per custom method.
    expect(Object.keys(mine)).toHaveLength(DEFS.length);
    expect(Object.keys(typed).length).toBeGreaterThan(Object.keys(mine).length * 3);

    // `merchant` appears in create_gift_card and update_gift_card on the typed
    // surface, but only once here. This is why the surface is cheaper in tokens
    // and not merely smaller in tool count.
    const occurrences = (tools: Record<string, { inputSchema: unknown }>) =>
      Object.values(tools).filter((spec) => JSON.stringify(spec.inputSchema).includes('merchant'))
        .length;
    expect(occurrences(mine)).toBe(1);
    expect(occurrences(typed)).toBe(2);
  });
});
