import { describe, expect, it } from 'vitest';
import { changedData, toolAction } from '../hooks/useConversation';
import type { HomesteadUIMessage } from '../types';

const withTool = (input: unknown, state = 'output-available'): HomesteadUIMessage =>
  ({
    id: 'a',
    role: 'assistant',
    parts: [{ type: 'tool-groceries', toolCallId: 't', state, input, output: {} }],
  }) as HomesteadUIMessage;

describe('toolAction', () => {
  it('reads the verb a per-resource call carried', () => {
    expect(toolAction({ action: 'create' })).toBe('create');
    expect(toolAction({ query: 'tax' })).toBe('');
    expect(toolAction(undefined)).toBe('');
  });
});

describe('changedData', () => {
  it('is true after a successful write or custom method', () => {
    expect(changedData(withTool({ action: 'create' }))).toBe(true);
    expect(changedData(withTool({ action: 'delete' }))).toBe(true);
    expect(changedData(withTool({ action: ':redeem' }))).toBe(true);
  });

  it('is false after reads, failed writes, and plain text', () => {
    expect(changedData(withTool({ action: 'list' }))).toBe(false);
    expect(changedData(withTool({ action: 'create' }, 'output-error'))).toBe(false);
    expect(
      changedData({ id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] }),
    ).toBe(false);
  });
});
