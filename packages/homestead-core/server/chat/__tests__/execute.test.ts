/**
 * Tests for chat tool execution against the server-side aepbase client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createFakeServerClient,
  fakeCollectionAt,
} from '../../__tests__/fake-server-client';
import { buildTools } from '../tools';
import { executeToolCall } from '../execute';
import type { ResourceDefinition } from '../../../resources/types';

const fake = createFakeServerClient();
vi.mock('../../client', () => ({
  serverClient: () => fake.client,
  collectionAt: (hs: never, plural: string, parent?: readonly string[]) =>
    fakeCollectionAt(fake.client, plural, parent),
}));

const { getFn, listAllFn, createFn, updateFn, deleteFn } = fake;

const todo: ResourceDefinition = {
  singular: 'todo',
  plural: 'todos',
  fields: {
    title: { type: 'string', required: true },
    done: { type: 'boolean' },
  },
};

const notification: ResourceDefinition = {
  singular: 'notification',
  plural: 'notifications',
  parents: ['user'],
  fields: {
    title: { type: 'string', required: true },
    subscription_data: { type: 'object' },
  },
};

const person: ResourceDefinition = {
  singular: 'person',
  plural: 'people',
  fields: { name: { type: 'string', required: true } },
};

const game: ResourceDefinition = {
  singular: 'game',
  plural: 'games',
  fields: {
    owner: { type: 'string', reference: { resource: 'person' } },
    players: {
      type: 'array',
      items: { type: 'string', reference: { resource: 'person' } },
    },
  },
};

const TOKEN = 'user-token';
const { bindings } = buildTools([todo, notification]);
const { bindings: refBindings } = buildTools([person, game]);

beforeEach(() => {
  vi.clearAllMocks();
  createFn.mockResolvedValue({ id: 'new-1' });
  getFn.mockResolvedValue({ id: 'rec-1' });
  listAllFn.mockResolvedValue([{ id: 'rec-1' }, { id: 'rec-2' }]);
  updateFn.mockResolvedValue({ id: 'rec-1', updated: true });
  deleteFn.mockResolvedValue(undefined);
});

describe('executeToolCall', () => {
  it('returns ok:false for unknown tools without throwing', async () => {
    const out = await executeToolCall({ name: 'nope', args: {} }, bindings, TOKEN);
    expect(out).toMatchObject({ ok: false, error: expect.stringContaining('unknown tool') });
  });

  it('create maps schema fields to the body at the resource collection', async () => {
    const out = await executeToolCall(
      { name: 'create_todo', args: { title: 'Buy milk', done: false, bogus: 1 } },
      bindings,
      TOKEN,
    );
    expect(out.ok).toBe(true);
    expect(createFn).toHaveBeenCalledWith('/todos', { title: 'Buy milk', done: false });
  });

  it('read without id lists; with id gets', async () => {
    const list = await executeToolCall({ name: 'read_todo', args: {} }, bindings, TOKEN);
    expect(listAllFn).toHaveBeenCalledWith('/todos', undefined);
    expect(list.result).toMatchObject({ total: 2 });

    await executeToolCall({ name: 'read_todo', args: { id: 'rec-1' } }, bindings, TOKEN);
    expect(getFn).toHaveBeenCalledWith('/todos/rec-1');
  });

  it('builds the parent path for user-scoped resources', async () => {
    await executeToolCall(
      { name: 'read_notification', args: { user_id: 'u-1' } },
      bindings,
      TOKEN,
    );
    expect(listAllFn).toHaveBeenCalledWith('/users/u-1/notifications', undefined);
  });

  it('fails recoverably when a parent id is missing', async () => {
    const out = await executeToolCall({ name: 'read_notification', args: {} }, bindings, TOKEN);
    expect(out).toMatchObject({
      ok: false,
      error: expect.stringContaining('user_id'),
    });
    expect(listAllFn).not.toHaveBeenCalled();
  });

  it('parses JSON-string fields before writing', async () => {
    await executeToolCall(
      {
        name: 'create_notification',
        args: {
          user_id: 'u-1',
          title: 'hi',
          subscription_data: '{"endpoint":"https://x"}',
        },
      },
      bindings,
      TOKEN,
    );
    expect(createFn).toHaveBeenCalledWith('/users/u-1/notifications', {
      title: 'hi',
      subscription_data: { endpoint: 'https://x' },
    });
  });

  it('reports invalid JSON-string fields as recoverable errors', async () => {
    const out = await executeToolCall(
      {
        name: 'create_notification',
        args: { user_id: 'u-1', title: 'hi', subscription_data: 'not json' },
      },
      bindings,
      TOKEN,
    );
    expect(out).toMatchObject({
      ok: false,
      error: expect.stringContaining('subscription_data'),
    });
  });

  it('update requires an id and merge-patches the record', async () => {
    const missing = await executeToolCall({ name: 'update_todo', args: {} }, bindings, TOKEN);
    expect(missing.ok).toBe(false);

    await executeToolCall(
      { name: 'update_todo', args: { id: 'rec-1', done: true } },
      bindings,
      TOKEN,
    );
    expect(updateFn).toHaveBeenCalledWith('/todos/rec-1', { done: true });
  });

  it('delete removes and reports the id', async () => {
    const out = await executeToolCall(
      { name: 'delete_todo', args: { id: 'rec-9' } },
      bindings,
      TOKEN,
    );
    expect(deleteFn).toHaveBeenCalledWith('/todos/rec-9', undefined);
    expect(out).toMatchObject({ ok: true, result: { deleted: true, id: 'rec-9' } });
  });

  it('converts aepbase errors into ok:false outcomes', async () => {
    createFn.mockRejectedValueOnce(new Error('create todos → 403'));
    const out = await executeToolCall(
      { name: 'create_todo', args: { title: 'x' } },
      bindings,
      TOKEN,
    );
    expect(out).toMatchObject({ ok: false, error: 'create todos → 403' });
  });
});

describe('executeToolCall — reference validation', () => {
  it('creates when a reference id resolves', async () => {
    const out = await executeToolCall(
      { name: 'create_game', args: { owner: 'p-1' } },
      refBindings,
      TOKEN,
    );
    expect(getFn).toHaveBeenCalledWith('/people/p-1');
    expect(out.ok).toBe(true);
    expect(createFn).toHaveBeenCalledWith('/games', { owner: 'p-1' });
  });

  it('accepts a reference given as the target resource path', async () => {
    // The SPA stores some references as `people/p-1`; the check must resolve
    // that to the record rather than fetching `/people/people%2Fp-1`.
    const out = await executeToolCall(
      { name: 'create_game', args: { owner: 'people/p-1' } },
      refBindings,
      TOKEN,
    );
    expect(getFn).toHaveBeenCalledWith('/people/p-1');
    expect(out.ok).toBe(true);
  });

  it('rejects a create whose reference id does not resolve, without writing', async () => {
    getFn.mockRejectedValueOnce(new Error('people/missing → 404'));
    const out = await executeToolCall(
      { name: 'create_game', args: { owner: 'missing' } },
      refBindings,
      TOKEN,
    );
    expect(out).toMatchObject({
      ok: false,
      error: expect.stringContaining('no people record with id "missing"'),
    });
    expect(createFn).not.toHaveBeenCalled();
  });

  it('validates every id in a to-many reference', async () => {
    getFn.mockImplementation(async (path: string) => {
      if (path.endsWith('/bad')) throw new Error('404');
      return { id: path };
    });
    const out = await executeToolCall(
      { name: 'create_game', args: { players: ['good', 'bad'] } },
      refBindings,
      TOKEN,
    );
    expect(out.ok).toBe(false);
    expect(createFn).not.toHaveBeenCalled();
  });

  it('skips validation when no reference field is supplied', async () => {
    const out = await executeToolCall(
      { name: 'create_game', args: {} },
      refBindings,
      TOKEN,
    );
    expect(getFn).not.toHaveBeenCalled();
    expect(out.ok).toBe(true);
  });

  it('validates references on update too', async () => {
    getFn.mockRejectedValueOnce(new Error('404'));
    const out = await executeToolCall(
      { name: 'update_game', args: { id: 'g-1', owner: 'missing' } },
      refBindings,
      TOKEN,
    );
    expect(out.ok).toBe(false);
    expect(updateFn).not.toHaveBeenCalled();
  });
});
