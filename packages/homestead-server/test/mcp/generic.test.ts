/**
 * The generic (consolidated) MCP tool surface: the six tools it exposes, the
 * discoverability it puts in their place (the `resource` enum, the catalog,
 * `describe_resources`, and errors that name what was accepted), and the
 * translation from a generic call to the typed call it stands for.
 *
 * Execution is asserted through a stubbed global `fetch` — the executors go to
 * the engine over loopback, so this pins the exact request a generic call makes
 * without needing a live engine.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { buildGenericTools, homesteadInstructions } from '../../src/mcp/generic';

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
  },
};

const TRANSACTION: ResourceDefinition = {
  singular: 'transaction',
  plural: 'transactions',
  parents: ['gift-card'],
  fields: { amount: { type: 'number', required: true } },
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

describe('the generic tool surface', () => {
  it('is six tools regardless of how many resources exist', () => {
    const { tools } = buildGenericTools(DEFS);
    expect(Object.keys(tools).sort()).toEqual([
      'create_record',
      'delete_record',
      'describe_resources',
      'read_records',
      'run_custom_method',
      'update_record',
    ]);
  });

  it('carries the catalog in every tool as an enum of resource names', () => {
    const { tools } = buildGenericTools(DEFS);
    const resource = (tools.read_records.inputSchema as z.ZodObject).shape.resource;
    expect(resource.safeParse('gift-cards').success).toBe(true);
    expect(resource.safeParse('transactions').success).toBe(true);
    // A hallucinated resource can't even be sent.
    expect(resource.safeParse('spaceships').success).toBe(false);
  });

  it('omits the write tools for a read-only registration', () => {
    const { tools } = buildGenericTools(DEFS, { write: false });
    expect(Object.keys(tools).sort()).toEqual(['describe_resources', 'read_records']);
  });

  it('drops run_custom_method when nothing declares one', async () => {
    const { tools } = buildGenericTools([TRANSACTION]);
    expect(tools).not.toHaveProperty('run_custom_method');
  });

  it('lists every custom method in the tool description', () => {
    const { tools } = buildGenericTools(DEFS);
    expect(tools.run_custom_method.description).toContain('gift-cards:redeem');
  });
});

describe('describe_resources', () => {
  it('returns the catalog with no argument', async () => {
    const { execute } = buildGenericTools(DEFS);
    const out = await execute('describe_resources', {}, 'tok');
    expect(out).toEqual({
      ok: true,
      result: {
        resources: [
          {
            resource: 'gift-cards',
            singular: 'gift-card',
            description: 'A gift card you hold.',
            custom_methods: ['redeem'],
          },
          {
            resource: 'transactions',
            singular: 'transaction',
            parent_ids: ['gift_card_id'],
          },
        ],
      },
    });
  });

  it('returns one resource in full, minus deprecated fields', async () => {
    const { execute } = buildGenericTools(DEFS);
    const out = await execute('describe_resources', { resource: 'gift-cards' }, 'tok');
    const result = (out as { result: Record<string, any> }).result;
    expect(Object.keys(result.fields).sort()).toEqual([
      'balance',
      'merchant',
      'owner',
      'receipt',
      'status',
    ]);
    expect(result.fields.merchant).toEqual({ type: 'string', required: true });
    expect(result.fields.status.enum).toEqual(['active', 'spent']);
    expect(result.fields.owner.reference).toBe('user');
    // File fields are uploaded through the SPA, so say they aren't writable.
    expect(result.fields.receipt.writable).toBe(false);
    expect(result.custom_methods).toEqual([
      {
        verb: 'redeem',
        target: 'item',
        description: 'Mark the card as spent.',
        request: {
          type: 'object',
          required: ['amount'],
          properties: { amount: { type: 'number' } },
        },
      },
    ]);
  });

  it('reports a nested resource\'s parent id params', async () => {
    const { execute } = buildGenericTools(DEFS);
    const out = await execute('describe_resources', { resource: 'transactions' }, 'tok');
    expect((out as { result: Record<string, any> }).result.parent_ids).toEqual([
      { param: 'gift_card_id', resource: 'gift-cards' },
    ]);
  });

  it('names the real resources when asked about one that does not exist', async () => {
    const { execute } = buildGenericTools(DEFS);
    const out = await execute('describe_resources', { resource: 'spaceships' }, 'tok');
    expect(out.ok).toBe(false);
    expect((out as { error: string }).error).toContain('gift-cards, transactions');
  });
});

describe('generic CRUD', () => {
  it('creates through the resource the call names', async () => {
    const { execute } = buildGenericTools(DEFS);
    const { calls } = stubFetch();
    const out = await execute(
      'create_record',
      { resource: 'gift-cards', fields: { merchant: 'Target', balance: 50 } },
      'tok',
    );
    expect(out.ok).toBe(true);
    expect(calls[0].url).toMatch(/\/gift-cards$/);
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      merchant: 'Target',
      balance: 50,
    });
  });

  it('threads parent_ids into the record path', async () => {
    const { execute } = buildGenericTools(DEFS);
    const { calls } = stubFetch();
    await execute(
      'create_record',
      { resource: 'transactions', parent_ids: { gift_card_id: 'gc1' }, fields: { amount: 5 } },
      'tok',
    );
    expect(calls[0].url).toMatch(/\/gift-cards\/gc1\/transactions$/);
  });

  it('rejects an unknown field and names the ones it accepts', async () => {
    const { execute } = buildGenericTools(DEFS);
    const { calls } = stubFetch();
    const out = await execute(
      'create_record',
      { resource: 'gift-cards', fields: { merchant: 'Target', ballance: 50 } },
      'tok',
    );
    expect(out.ok).toBe(false);
    const { error } = out as { error: string };
    expect(error).toContain('unknown field "ballance"');
    expect(error).toContain('merchant, balance, status, owner');
    // Nothing was sent — a typo can't silently drop a value.
    expect(calls).toHaveLength(0);
  });

  it('enforces required fields and enums, the same as the typed tools did', async () => {
    const { execute } = buildGenericTools(DEFS);
    stubFetch();
    const missing = await execute('create_record', { resource: 'gift-cards', fields: {} }, 'tok');
    expect(missing.ok).toBe(false);
    expect((missing as { error: string }).error).toContain('merchant');

    const badEnum = await execute(
      'create_record',
      { resource: 'gift-cards', fields: { merchant: 'Target', status: 'burned' } },
      'tok',
    );
    expect(badEnum.ok).toBe(false);
    expect((badEnum as { error: string }).error).toContain('status');
  });

  it('reads one record by id and lists without one', async () => {
    const { execute } = buildGenericTools(DEFS);
    const single = stubFetch(new Response('{"path":"/gift-cards/abc"}'));
    await execute('read_records', { resource: 'gift-cards', id: 'abc' }, 'tok');
    expect(single.calls[0].url).toMatch(/\/gift-cards\/abc$/);
    single.restore();

    const list = stubFetch(new Response('{"results":[]}'));
    const out = await execute('read_records', { resource: 'gift-cards' }, 'tok');
    expect(list.calls[0].url).toMatch(/\/gift-cards(\?|$)/);
    expect(out).toEqual({ ok: true, result: { records: [], count: 0, truncated: false } });
  });

  it('merge-patches on update and deletes by id', async () => {
    const { execute } = buildGenericTools(DEFS);
    const patch = stubFetch();
    await execute(
      'update_record',
      { resource: 'gift-cards', id: 'abc', fields: { balance: 10 } },
      'tok',
    );
    expect(patch.calls[0].init.method).toBe('PATCH');
    expect(JSON.parse(patch.calls[0].init.body as string)).toEqual({ balance: 10 });
    patch.restore();

    const del = stubFetch(new Response(null, { status: 204 }));
    const out = await execute('delete_record', { resource: 'gift-cards', id: 'abc' }, 'tok');
    expect(del.calls[0].init.method).toBe('DELETE');
    expect(out).toEqual({ ok: true, result: { deleted: true, id: 'abc' } });
  });

  it('refuses a write on a read-only surface', async () => {
    const { execute } = buildGenericTools(DEFS, { write: false });
    const { calls } = stubFetch();
    const out = await execute(
      'create_record',
      { resource: 'gift-cards', fields: { merchant: 'Target' } },
      'tok',
    );
    expect(out).toEqual({ ok: false, error: 'create_record needs write access' });
    expect(calls).toHaveLength(0);
  });
});

describe('writes gated per resource', () => {
  const onlyTransactions = { write: (def: ResourceDefinition) => def.singular === 'transaction' };

  it('keeps the write tools while any resource is writable, and marks the rest read-only', async () => {
    const { tools, execute } = buildGenericTools(DEFS, onlyTransactions);
    expect(tools).toHaveProperty('create_record');
    const out = await execute('describe_resources', {}, 'tok');
    const catalog = (out as { ok: true; result: { resources: Array<{ resource: string; read_only?: true }> } })
      .result.resources;
    expect(catalog.find((r) => r.resource === 'gift-cards')?.read_only).toBe(true);
    expect(catalog.find((r) => r.resource === 'transactions')?.read_only).toBeUndefined();
  });

  it('refuses a write to a read-only resource, and its non-GET custom methods', async () => {
    const { tools, execute } = buildGenericTools(DEFS, onlyTransactions);
    const { calls } = stubFetch();
    expect(
      await execute('create_record', { resource: 'gift-cards', fields: { merchant: 'Target' } }, 'tok'),
    ).toEqual({ ok: false, error: 'gift-cards is read-only for this caller' });
    // gift-cards:redeem is a POST, so nothing callable is left to advertise.
    expect(tools).not.toHaveProperty('run_custom_method');
    expect(calls).toHaveLength(0);
  });
});

describe('run_custom_method', () => {
  it('dispatches to the declared method with its body', async () => {
    const { execute } = buildGenericTools(DEFS);
    const { calls } = stubFetch();
    const out = await execute(
      'run_custom_method',
      { resource: 'gift-cards', verb: 'redeem', id: 'gc1', body: { amount: 25 } },
      'tok',
    );
    expect(out.ok).toBe(true);
    expect(calls[0].url).toMatch(/\/gift-cards\/gc1:redeem$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ amount: 25 });
  });

  it('names the available verbs when the one asked for does not exist', async () => {
    const { execute } = buildGenericTools(DEFS);
    const out = await execute(
      'run_custom_method',
      { resource: 'gift-cards', verb: 'incinerate' },
      'tok',
    );
    expect(out.ok).toBe(false);
    expect((out as { error: string }).error).toContain('it has: redeem');
  });

  it('says so when a resource has no custom methods at all', async () => {
    const { execute } = buildGenericTools(DEFS);
    const out = await execute(
      'run_custom_method',
      { resource: 'transactions', verb: 'redeem' },
      'tok',
    );
    expect(out).toEqual({ ok: false, error: 'transactions has no custom methods' });
  });
});

describe('homesteadInstructions', () => {
  it('lists every resource with its description and custom methods', () => {
    const instructions = homesteadInstructions(DEFS);
    expect(instructions).toContain('- gift-cards — A gift card you hold. [custom methods: redeem]');
    expect(instructions).toContain('- transactions');
    expect(instructions).toContain('describe_resources');
  });
});
