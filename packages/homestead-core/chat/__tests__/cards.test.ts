import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig, ChatCardType, RecordCardType } from '../../apps/types';
import { initializeAppRegistry, resetAppRegistry } from '../../apps/registry';
import {
  cardActionOf,
  cardMode,
  cardRecordId,
  cardRows,
  chatCardFor,
  humanizeName,
  listedRecords,
  ownerForTool,
  recordCardFor,
  toolOutcome,
} from '../cards';
import { resourceLabel, recordTitle } from '../../resources/display';

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
});
