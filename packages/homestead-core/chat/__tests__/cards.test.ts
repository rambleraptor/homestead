import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig, ChatCardType, RecordCardType } from '../../apps/types';
import { initializeAppRegistry, resetAppRegistry } from '../../apps/registry';
import {
  addBatch,
  addsUp,
  cardActionOf,
  cardMode,
  cardRecordId,
  cardRows,
  chatCardFor,
  groupParts,
  holds,
  humanizeName,
  listedRecords,
  ownerForTool,
  recordCardFor,
  rollsUp,
  runKeyOf,
  toolOutcome,
  undoPlan,
} from '../cards';
import { resourceLabel, recordTitle } from '../../resources/display';
import type { ResourceDefinition } from '../../resources/types';

const lazy = (() => Promise.resolve(() => null)) as ChatCardType['component'];
const listCard: ChatCardType = { component: lazy, actions: ['list'] };
const anyCard: ChatCardType = { component: lazy };
const sendCard: ChatCardType = { component: lazy };
const recordCard: RecordCardType = { component: lazy as unknown as RecordCardType['component'] };

const todos = {
  id: 'todos',
  name: 'Todos',
  resources: [
    {
      singular: 'todo',
      plural: 'todos',
      fields: {
        title: { type: 'string', required: true },
        status: { type: 'string', enum: ['pending', 'do_later'] },
        project: { type: 'string', reference: { resource: 'project' } },
        due: { type: 'string', format: 'date-time' },
        urgent: { type: 'boolean' },
        pin: { type: 'string', encrypted: true },
        token: { type: 'string', secret: true },
        photo: { type: 'file' },
      },
    },
  ],
  records: { todo: recordCard },
  chat: { cards: { todo: listCard } },
} as unknown as AppConfig;

const giftCards = {
  id: 'gift-cards',
  name: 'Gift cards',
  resources: [{ singular: 'gift-card', plural: 'gift-cards', fields: { merchant: { type: 'string' } } }],
  chat: { cards: { 'gift-card': anyCard, 'gift-card:send': sendCard } },
  children: [
    {
      id: 'nested',
      name: 'Nested',
      resources: [{ singular: 'perk', plural: 'perks', fields: {} }],
    },
  ],
} as unknown as AppConfig;

describe('cards', () => {
  beforeEach(() => initializeAppRegistry([todos, giftCards]));
  afterEach(() => resetAppRegistry());

  it('reads a tool part back to its resource and app, nested apps included', () => {
    expect(ownerForTool('tool-todos')?.def.singular).toBe('todo');
    expect(ownerForTool('tool-gift_cards')?.app.id).toBe('gift-cards');
    expect(ownerForTool('tool-perks')?.app.id).toBe('nested');
    expect(ownerForTool('tool-mcp_ha__get_state')).toBeUndefined();
    expect(ownerForTool('tool-search_documents')).toBeUndefined();
    expect(ownerForTool('text')).toBeUndefined();
  });

  it('names the action from the input, CRUD or a :verb', () => {
    expect(cardActionOf({ action: 'create' })).toBe('create');
    expect(cardActionOf({ action: 'get' })).toBe('read');
    expect(cardActionOf({ action: 'read' })).toBe('read');
    expect(cardActionOf({ action: ':send' })).toBe(':send');
    expect(cardActionOf({ action: 'drop' })).toBeNull();
    expect(cardActionOf({ action: ':Send!' })).toBeNull();
    expect(cardActionOf(undefined)).toBeNull();
  });

  it("picks the app's chat card only for the actions it claims", () => {
    const todo = ownerForTool('tool-todos')!;
    expect(chatCardFor(todo, 'list')).toBe(listCard);
    expect(chatCardFor(todo, 'create')).toBeUndefined();
    const giftCard = ownerForTool('tool-gift_cards')!;
    expect(chatCardFor(giftCard, 'create')).toBe(anyCard);
    expect(chatCardFor(giftCard, ':send')).toBe(sendCard);
    expect(chatCardFor(giftCard, ':refund')).toBeUndefined();
    expect(chatCardFor(ownerForTool('tool-perks')!, 'read')).toBeUndefined();
  });

  it("finds the app's record card by singular", () => {
    expect(recordCardFor(ownerForTool('tool-todos')!)).toBe(recordCard);
    expect(recordCardFor(ownerForTool('tool-gift_cards')!)).toBeUndefined();
  });

  it('reads the outcome off the executor output', () => {
    expect(toolOutcome({ state: 'output-available', output: { result: { id: 'a' } } })).toEqual({
      result: { id: 'a' },
    });
    expect(toolOutcome({ state: 'output-available', output: { error: 'nope' } })).toEqual({ error: 'nope' });
    expect(toolOutcome({ state: 'output-error', errorText: 'boom' })).toEqual({ error: 'boom' });
    expect(toolOutcome({ state: 'input-available' })).toEqual({});
    // A capped output is a preview, not the executor's shape.
    expect(toolOutcome({ state: 'output-available', output: 'preview…' })).toEqual({ result: 'preview…' });
  });

  it('maps a part state to a card mode, with a failed call told apart from a finished one', () => {
    expect(cardMode({ state: 'input-streaming' })).toBe('running');
    expect(cardMode({ state: 'input-available' })).toBe('running');
    expect(cardMode({ state: 'approval-requested' })).toBe('proposed');
    expect(cardMode({ state: 'approval-responded' })).toBe('running');
    expect(cardMode({ state: 'output-denied' })).toBe('denied');
    expect(cardMode({ state: 'output-error', errorText: 'x' })).toBe('failed');
    expect(cardMode({ state: 'output-available', output: { result: {} } })).toBe('done');
    expect(cardMode({ state: 'output-available', output: { error: 'x' } })).toBe('failed');
  });

  it('finds the record id and the listed records', () => {
    expect(cardRecordId({ id: 'from-input' }, { id: 'from-result' })).toBe('from-result');
    expect(cardRecordId({ id: 'from-input' }, undefined)).toBe('from-input');
    expect(cardRecordId({}, 'preview')).toBeUndefined();
    expect(listedRecords({ records: [{ id: 'a' }], count: 1 })).toEqual([{ id: 'a' }]);
    expect(listedRecords('preview')).toBeUndefined();
  });

  it('turns a body into labeled rows, leaving out what people should not see as text', () => {
    const def = ownerForTool('tool-todos')!.def;
    const rows = cardRows(
      def,
      {
        title: 'Call the plumber',
        status: 'do_later',
        project: 'projects/abc',
        due: 'not a date',
        urgent: true,
        pin: '1234',
        token: 'secret',
        photo: 'file-id',
        created_by: 'users/me',
        id: 'x',
        notes: '',
        extra: 'kept',
        nested: { a: 1 },
      },
      ['title'],
    );
    expect(rows).toEqual([
      { label: 'Status', value: 'Do later' },
      { label: 'Due', value: 'not a date' },
      { label: 'Urgent', value: 'Yes' },
      { label: 'Extra', value: 'kept' },
    ]);
    expect(cardRows(def, 'preview')).toEqual([]);
  });

  it('cuts a long value short, so a pasted document stays behind Details', () => {
    const def = ownerForTool('tool-todos')!.def;
    const long = 'word '.repeat(60).trim();
    const [row] = cardRows(def, { extra: long });
    expect(row!.value.length).toBeLessThan(long.length);
    expect(row!.value.endsWith('…')).toBe(true);
    expect(cardRows(def, { extra: 'short' })[0]!.value).toBe('short');
  });

  it('labels resources and records', () => {
    expect(humanizeName('annual_fee')).toBe('Annual fee');
    expect(resourceLabel({ singular: 'gift-card', plural: 'gift-cards' })).toBe('Gift card');
    expect(resourceLabel({ singular: 'gift-card', plural: 'gift-cards' }, 'plural')).toBe('Gift cards');
    expect(recordTitle({ title: 'A', name: 'B' })).toBe('A');
    expect(recordTitle({ name: 'people/jake' })).toBe('jake');
    expect(recordTitle({ merchant: 'REI' })).toBe('REI');
    expect(recordTitle({ display_name: 'Sam', email: 's@x.io' })).toBe('Sam');
    expect(recordTitle({ email: 's@x.io' })).toBe('s@x.io');
    expect(recordTitle({ amount: 5 })).toBeUndefined();
    expect(recordTitle('preview')).toBeUndefined();
  });

  it('carries what an update or delete replaced through to the card', () => {
    expect(
      toolOutcome({ state: 'output-available', output: { result: { id: 'a' }, previous: { title: 'Old' } } }),
    ).toEqual({ result: { id: 'a' }, previous: { title: 'Old' } });
    expect(toolOutcome({ state: 'output-available', output: { result: {}, previous: 'x' } })).toEqual({ result: {} });
  });

  describe('undo', () => {
    const todo = () => (todos.resources as ResourceDefinition[])[0]!;
    const updated = {
      resource: todo(),
      action: 'update' as const,
      mode: 'done' as const,
      input: { id: 't1', fields: { status: 'do_later' } },
      result: { id: 't1', title: 'Plumber', status: 'do_later' },
      previous: { status: 'pending' },
    };

    it('puts an update back field by field, comparing against what the call set', () => {
      expect(undoPlan(updated, false)).toEqual({
        kind: 'update',
        id: 't1',
        previous: { status: 'pending' },
        set: { status: 'do_later' },
      });
    });

    it("won't undo an update it can't fully put back, or one that didn't finish", () => {
      // The call wrote a field the executor couldn't record (a file, a secret).
      expect(undoPlan({ ...updated, input: { id: 't1', fields: { status: 'do_later', photo: 'f' } } }, false)).toBeNull();
      expect(undoPlan({ ...updated, previous: undefined }, false)).toBeNull();
      expect(undoPlan({ ...updated, mode: 'failed' }, false)).toBeNull();
      expect(undoPlan({ ...updated, result: 'preview…' }, false)).toBeNull();
    });

    it('restores a deleted top-level record under its old id, without files or secrets', () => {
      const resource: ResourceDefinition = {
        singular: 'todo',
        plural: 'todos',
        user_settable_create: true,
        fields: { title: { type: 'string' }, status: { type: 'string' }, photo: { type: 'file' } },
      };
      const deleted = {
        resource,
        action: 'delete' as const,
        mode: 'done' as const,
        input: { id: 't1' },
        result: { deleted: true, id: 't1' },
        previous: { id: 't1', path: 'todos/t1', title: 'Plumber', status: 'pending', create_time: 'x' },
      };
      expect(undoPlan(deleted, false)).toEqual({
        kind: 'restore',
        id: 't1',
        body: { title: 'Plumber', status: 'pending' },
      });
      // Children went with it; a nested record or one without chosen ids can't come back the same.
      expect(undoPlan(deleted, true)).toBeNull();
      expect(undoPlan({ ...deleted, resource: { ...resource, parents: ['user'] } }, false)).toBeNull();
      expect(undoPlan({ ...deleted, resource: { ...resource, user_settable_create: false } }, false)).toBeNull();
      // A file can't be written back; a secret never reached the reply.
      expect(undoPlan({ ...deleted, previous: { ...deleted.previous, photo: { id: 'f1' } } }, false)).toBeNull();
      const withSecret = { ...resource, fields: { ...resource.fields, token: { type: 'string' as const, secret: true } } };
      expect(undoPlan({ ...deleted, resource: withSecret }, false)).toBeNull();
    });

    it('compares values with empty ones alike', () => {
      expect(holds({ a: 1, b: '' }, { a: 1, b: null, c: null })).toBe(true);
      expect(holds({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
      expect(holds({ a: 'x' }, { a: 'y' })).toBe(false);
    });
  });

  describe('read rollup', () => {
    const read = (type: string, action: string) => ({
      type,
      state: 'output-available' as const,
      input: { action },
      output: { result: { records: [] } },
    });

    it('folds only finished reads the app does not draw itself', () => {
      expect(rollsUp(read('tool-perks', 'list'))).toBe(true);
      expect(rollsUp(read('tool-perks', 'get'))).toBe(true);
      // An app that draws the action itself keeps its card on show.
      expect(rollsUp(read('tool-todos', 'list'))).toBe(false);
      expect(rollsUp(read('tool-gift_cards', 'get'))).toBe(false);
      expect(rollsUp(read('tool-perks', 'update'))).toBe(false);
      expect(rollsUp({ ...read('tool-perks', 'list'), output: { error: 'nope' } })).toBe(false);
      expect(rollsUp({ ...read('tool-perks', 'list'), state: 'input-available' as never })).toBe(false);
      expect(rollsUp(read('tool-mcp_ha__get_state', 'get'))).toBe(false);
    });

    it('groups runs of two or more, across step boundaries, and leaves a lone read alone', () => {
      const parts = [
        { type: 'step-start', id: 0 },
        { type: 'r', id: 1 },
        { type: 'step-start', id: 2 },
        { type: 'r', id: 3 },
        { type: 'text', text: 'Found them.', id: 4 },
        { type: 'r', id: 5 },
        { type: 'w', id: 6 },
      ];
      const groups = groupParts(parts, (p) => (p.type === 'r' ? 'reads' : null));
      expect(groups.map((g) => (g.kind === 'run' ? `${g.key}:${g.parts.map((p) => p.id)}` : `one:${g.part.id}`))).toEqual([
        'one:0',
        'reads:1,3',
        'one:2',
        'one:4',
        'one:5',
        'one:6',
      ]);
    });

    it('starts a new run where the kind of run changes', () => {
      const parts = [
        { type: 'a', id: 0 },
        { type: 'a', id: 1 },
        { type: 'b', id: 2 },
        { type: 'b', id: 3 },
        { type: 'a', id: 4 },
      ];
      const groups = groupParts(parts, (p) => p.type);
      expect(groups.map((g) => (g.kind === 'run' ? `${g.key}:${g.parts.map((p) => p.id)}` : `one:${g.part.id}`))).toEqual([
        'a:0,1',
        'b:2,3',
        'one:4',
      ]);
    });
  });

  describe('add batch', () => {
    const add = (type: string, title: string, rest: Record<string, unknown> = {}) => ({
      type,
      state: 'output-available' as const,
      input: { action: 'create', fields: { title } },
      output: { result: { id: title.toLowerCase(), title } },
      ...rest,
    });

    it('takes creates on a Homestead resource, running or finished or failed', () => {
      expect(addsUp(add('tool-todos', 'A'))).toBe(true);
      expect(addsUp(add('tool-todos', 'A', { state: 'input-available', output: undefined }))).toBe(true);
      expect(addsUp(add('tool-todos', 'A', { output: { error: 'nope' } }))).toBe(true);
      // Waiting on the person, or refused: the call keeps its own card.
      expect(addsUp(add('tool-todos', 'A', { state: 'approval-requested' }))).toBe(false);
      expect(addsUp(add('tool-todos', 'A', { state: 'output-denied' }))).toBe(false);
      expect(addsUp({ ...add('tool-todos', 'A'), input: { action: 'update', id: 'a' } })).toBe(false);
      // Arguments still streaming in: not yet known to be a create.
      expect(addsUp({ ...add('tool-todos', 'A'), state: 'input-streaming' as never, input: undefined })).toBe(false);
      expect(addsUp(add('tool-mcp_ha__add', 'A'))).toBe(false);
    });

    it('folds adds per resource, apart from reads', () => {
      expect(runKeyOf(add('tool-todos', 'A'))).toBe('adds:tool-todos');
      expect(runKeyOf(add('tool-perks', 'A'))).toBe('adds:tool-perks');
      expect(runKeyOf({ ...add('tool-perks', 'A'), input: { action: 'list' }, output: { result: { records: [] } } })).toBe('reads');
      expect(runKeyOf({ ...add('tool-todos', 'A'), input: { action: 'update', id: 'a' } })).toBeNull();
    });

    it('sums up what was made, what is still running, and what failed', () => {
      const batch = addBatch(
        [
          add('tool-todos', 'Eggs'),
          add('tool-todos', 'Bread', { state: 'input-available', output: undefined }),
          add('tool-todos', 'Milk', { output: { error: 'title is taken' } }),
          add('tool-todos', 'Rice', { state: 'output-error', output: undefined, errorText: 'boom' }),
          add('tool-todos', 'Tea'),
        ],
        recordTitle,
      );
      expect(batch).toEqual({
        total: 5,
        records: [
          { id: 'eggs', title: 'Eggs' },
          { id: 'tea', title: 'Tea' },
        ],
        pending: 1,
        failed: [
          { title: 'Milk', error: 'title is taken' },
          { title: 'Rice', error: 'boom' },
        ],
      });
    });
  });
});
