/**
 * The part → toast mapping for a reply that finished out of sight: which tool
 * calls earn a toast, what it says, and when a burst collapses to one.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig, RecordCardType } from '../../apps/types';
import { initializeAppRegistry, resetAppRegistry } from '../../apps/registry';
import type { HomesteadUIMessage } from '../types';
import { assistantChangeToasts, conversationHref, showAssistantChanges } from '../recordToast';

const customFn = vi.fn();
const infoFn = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    custom: (...args: unknown[]) => customFn(...args),
    info: (...args: unknown[]) => infoFn(...args),
    dismiss: vi.fn(),
  }),
}));

const lazy = (() => Promise.resolve(() => null)) as unknown as RecordCardType['component'];
const recordCard: RecordCardType = { component: lazy };

const todos = {
  id: 'todos',
  name: 'Todos',
  resources: [{ singular: 'todo', plural: 'todos', fields: { title: { type: 'string' } } }],
  records: { todo: recordCard },
} as unknown as AppConfig;

const notes = {
  id: 'notes',
  name: 'Notes',
  resources: [{ singular: 'note', plural: 'notes', fields: { title: { type: 'string' } } }],
} as unknown as AppConfig;

const personal = {
  id: 'personal',
  name: 'Personal',
  resources: [
    { singular: 'personal-todo', plural: 'personal-todos', parents: ['user'], fields: { title: { type: 'string' } } },
  ],
  records: { 'personal-todo': recordCard },
} as unknown as AppConfig;

type Part = HomesteadUIMessage['parts'][number];

const tool = (type: string, input: unknown, output: unknown, state = 'output-available'): Part =>
  ({ type, toolCallId: crypto.randomUUID(), state, input, output }) as unknown as Part;

const reply = (...parts: Part[]): HomesteadUIMessage =>
  ({ id: 'm1', role: 'assistant', parts }) as HomesteadUIMessage;

describe('assistantChangeToasts', () => {
  beforeEach(() => initializeAppRegistry([todos, notes, personal]));
  afterEach(() => {
    resetAppRegistry();
    customFn.mockClear();
    infoFn.mockClear();
  });

  it('turns a successful add into a record toast with the record in it', () => {
    const made = { id: 't1', title: 'Water the plants' };
    const toasts = assistantChangeToasts(
      reply(tool('tool-todos', { action: 'create', fields: { title: 'Water the plants' } }, { result: made })),
      'c1',
    );
    expect(toasts).toEqual([
      {
        kind: 'record',
        message: 'The assistant added Water the plants',
        card: { singular: 'todo', id: 't1', snapshot: made, parent: undefined },
      },
    ]);
  });

  it('says updated, and carries a nested record\'s parent', () => {
    const changed = { id: 'p1', title: 'Call mum', path: 'users/u1/personal-todos/p1' };
    const toasts = assistantChangeToasts(
      reply(tool('tool-personal_todos', { action: 'update', id: 'p1', user_id: 'u1', fields: { title: 'Call mum' } }, { result: changed })),
      'c1',
    );
    expect(toasts).toEqual([
      {
        kind: 'record',
        message: 'The assistant updated Call mum',
        card: { singular: 'personal-todo', id: 'p1', snapshot: changed, parent: ['users', 'u1'] },
      },
    ]);
  });

  it('says deleted as a plain line, named from what was there', () => {
    const toasts = assistantChangeToasts(
      reply(tool('tool-todos', { action: 'delete', id: 't1' }, { result: { deleted: true, id: 't1' }, previous: { id: 't1', title: 'Old chore' } })),
      'c1',
    );
    expect(toasts).toEqual([{ kind: 'line', message: 'The assistant deleted Old chore' }]);
  });

  it('falls back to the resource when the record has no title', () => {
    const toasts = assistantChangeToasts(
      reply(tool('tool-todos', { action: 'create', fields: {} }, { result: { id: 't9' } })),
      'c1',
    );
    expect(toasts[0]?.message).toBe('The assistant added a todo');
  });

  it('skips reads, failed writes, calls still running, text, and resources without a record card', () => {
    const toasts = assistantChangeToasts(
      reply(
        tool('tool-todos', { action: 'list' }, { result: { records: [], count: 0 } }),
        tool('tool-todos', { action: 'get', id: 't1' }, { result: { id: 't1', title: 'x' } }),
        tool('tool-todos', { action: 'create', fields: { title: 'Nope' } }, { error: 'denied' }),
        tool('tool-todos', { action: 'create', fields: { title: 'Soon' } }, undefined, 'input-available'),
        tool('tool-notes', { action: 'create', fields: { title: 'A note' } }, { result: { id: 'n1', title: 'A note' } }),
        tool('tool-search', { query: 'tax' }, { result: [] }),
        { type: 'text', text: 'Done.' } as Part,
      ),
      'c1',
    );
    expect(toasts).toEqual([]);
  });

  it('keeps up to three changes as their own toasts', () => {
    const parts = [1, 2, 3].map((n) =>
      tool('tool-todos', { action: 'create', fields: { title: `T${n}` } }, { result: { id: `t${n}`, title: `T${n}` } }),
    );
    expect(assistantChangeToasts(reply(...parts), 'c1').map((t) => t.message)).toEqual([
      'The assistant added T1',
      'The assistant added T2',
      'The assistant added T3',
    ]);
  });

  it('collapses more than three into one count that opens the conversation', () => {
    const parts = [1, 2, 3, 4].map((n) =>
      tool('tool-todos', { action: n === 4 ? 'delete' : 'create', id: `t${n}`, fields: { title: `T${n}` } }, { result: { id: `t${n}`, title: `T${n}` } }),
    );
    expect(assistantChangeToasts(reply(...parts), 'c1')).toEqual([
      { kind: 'summary', message: 'The assistant changed 4 things', href: '/dashboard/c/c1' },
    ]);
    expect(assistantChangeToasts(reply(...parts), null)[0]).toMatchObject({ kind: 'summary', href: null });
  });

  it('shows each kind through sonner', () => {
    showAssistantChanges([
      { kind: 'record', message: 'The assistant added Milk', card: { singular: 'todo', id: 't1' } },
      { kind: 'line', message: 'The assistant deleted Eggs' },
      { kind: 'summary', message: 'The assistant changed 5 things', href: conversationHref('c1') },
    ]);
    expect(customFn).toHaveBeenCalledTimes(2);
    expect(customFn.mock.calls[0]?.[1]).toMatchObject({ className: 'w-full' });
    expect(infoFn).toHaveBeenCalledWith('The assistant deleted Eggs');
  });
});
