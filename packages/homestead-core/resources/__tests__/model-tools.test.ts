import { describe, expect, it } from 'vitest';
import { reachableBy, visibleToModel, type CollectionAccess } from '../model-tools';
import type { ResourceDefinition } from '../types';

const def = (singular: string, extra: Partial<ResourceDefinition> = {}): ResourceDefinition => ({
  singular,
  plural: `${singular}s`,
  fields: {},
  ...extra,
});

const DEFS = [
  def('book'),
  def('conversation', { modelTools: { chat: false } }),
  def('message', { parents: ['conversation'] }),
  def('attachment', { parents: ['message'] }),
  def('audit', { modelTools: { mcp: false } }),
  def('both', { modelTools: { chat: false, mcp: false } }),
  def('note', { parents: ['user'] }),
];

const names = (defs: ResourceDefinition[]) => defs.map((d) => d.singular);

describe('visibleToModel', () => {
  it('hides a resource from the surface it opts out of, and only that one', () => {
    expect(names(visibleToModel(DEFS, 'chat'))).toEqual(['book', 'audit', 'note']);
    expect(names(visibleToModel(DEFS, 'mcp'))).toEqual([
      'book',
      'conversation',
      'message',
      'attachment',
      'note',
    ]);
  });

  it('takes a hidden resource’s whole subtree with it', () => {
    const chat = names(visibleToModel(DEFS, 'chat'));
    expect(chat).not.toContain('message');
    expect(chat).not.toContain('attachment');
  });

  it('treats an explicit true, and an absent flag, as visible', () => {
    const defs = [def('a', { modelTools: { chat: true } }), def('b', { modelTools: {} })];
    expect(names(visibleToModel(defs, 'chat'))).toEqual(['a', 'b']);
  });

  it('keeps children of the built-in user root, which is never a declared def', () => {
    expect(names(visibleToModel([def('note', { parents: ['user'] })], 'chat'))).toEqual(['note']);
  });
});

describe('reachableBy', () => {
  const access = (entries: Record<string, Partial<CollectionAccess>>) =>
    new Map(Object.entries(entries).map(([k, v]) => [k, { read: false, write: false, ...v }]));

  it('keeps what the caller can read, read-only or not', () => {
    const defs = [def('book'), def('audit'), def('note', { parents: ['user'] })];
    const reach = access({ book: { read: true, write: true }, audit: { read: true }, note: { read: true } });
    expect(names(reachableBy(defs, reach))).toEqual(['book', 'audit', 'note']);
  });

  it("drops what they can't read, with its descendants", () => {
    const defs = [def('conversation'), def('message', { parents: ['conversation'] }), def('book')];
    const reach = access({ conversation: {}, message: { read: true }, book: { read: true } });
    expect(names(reachableBy(defs, reach))).toEqual(['book']);
  });

  it('drops a resource the engine did not report', () => {
    expect(names(reachableBy([def('book'), def('ghost')], access({ book: { read: true } })))).toEqual(['book']);
  });
});
