/**
 * The turn runner's pure pieces: how a finished step becomes stored UI parts,
 * how stored messages become the model's history, and the small rules around
 * them. The runner itself runs end to end in tests/vm/chat-turns.vm.ts.
 */

import { describe, expect, it } from 'vitest';
import { convertToModelMessages } from 'ai';
import type { UIMessage } from 'ai';
import {
  capOutput,
  denyPendingApprovals,
  mergeStep,
  partsFromStep,
  pendingApproval,
  settleResumedCall,
  STORED_OUTPUT_CAP,
  textOfParts,
  titleFrom,
  toUiMessages,
} from '../turns';
import { chatResources } from '../../../chat/resources';
import { validateResourceDefinition } from '../../../resources/translate';

describe('partsFromStep', () => {
  it('merges each tool call with its result, in order, after a step marker', () => {
    const parts = partsFromStep([
      { type: 'tool-call', toolCallId: 'c1', toolName: 'groceries', input: { action: 'list' } },
      {
        type: 'tool-result',
        toolCallId: 'c1',
        toolName: 'groceries',
        input: { action: 'list' },
        output: { result: { count: 0 } },
      },
      { type: 'text', text: 'Nothing on the list.' },
    ]);
    expect(parts).toEqual([
      { type: 'step-start' },
      {
        type: 'tool-groceries',
        toolCallId: 'c1',
        state: 'output-available',
        input: { action: 'list' },
        output: { result: { count: 0 } },
      },
      { type: 'text', text: 'Nothing on the list.', state: 'done' },
    ]);
  });

  it('records a failed tool call as an error part', () => {
    const [, part] = partsFromStep([
      { type: 'tool-call', toolCallId: 'c1', toolName: 'todos', input: {} },
      { type: 'tool-error', toolCallId: 'c1', toolName: 'todos', input: {}, error: 'boom' },
    ]);
    expect(part).toMatchObject({ type: 'tool-todos', state: 'output-error', errorText: 'boom' });
  });

  it('ignores content it has no part for, and empty text', () => {
    expect(partsFromStep([{ type: 'source' }, { type: 'text', text: '' }])).toEqual([
      { type: 'step-start' },
    ]);
  });
});

describe('capOutput', () => {
  it('keeps a small output as it is', () => {
    expect(capOutput({ a: 1 })).toEqual({ a: 1 });
  });

  it('replaces a large one with a preview and its size', () => {
    const big = { records: Array.from({ length: 500 }, (_, i) => ({ id: `r${i}` })) };
    const capped = capOutput(big) as { truncated: boolean; size: number; preview: string };
    expect(capped.truncated).toBe(true);
    expect(capped.size).toBeGreaterThan(STORED_OUTPUT_CAP);
    expect(capped.preview.length).toBe(1000);
  });
});

describe('stored history → the model', () => {
  it('rebuilds tool calls and results, so the model remembers what it read', async () => {
    const ui = toUiMessages([
      { id: 'u1', seq: 1, role: 'user', content: 'what is on the list?', parts: [{ type: 'text', text: 'what is on the list?' }] },
      {
        id: 'a1',
        seq: 2,
        role: 'assistant',
        parts: partsFromStep([
          { type: 'tool-call', toolCallId: 'c1', toolName: 'groceries', input: { action: 'list' } },
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'groceries',
            input: { action: 'list' },
            output: { result: { records: [{ name: 'Milk' }] } },
          },
          { type: 'text', text: 'Milk.' },
        ]),
      },
    ]);
    const model = await convertToModelMessages(ui);
    expect(model.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
    expect(JSON.stringify(model[2])).toContain('Milk');
  });

  it('drops an assistant message that never produced anything', () => {
    const ui = toUiMessages([
      { id: 'u1', seq: 1, role: 'user', content: 'hi' },
      { id: 'a1', seq: 2, role: 'assistant', parts: [], status: 'streaming' },
      { id: 'a2', seq: 3, role: 'assistant', parts: [{ type: 'step-start' }], status: 'error' },
    ]);
    expect(ui.map((m) => m.id)).toEqual(['u1']);
  });

  it('falls back to the plain content when a message has no parts', () => {
    expect(toUiMessages([{ id: 'u1', seq: 1, role: 'user', content: 'hi' }])[0]!.parts).toEqual([
      { type: 'text', text: 'hi' },
    ]);
  });

  it('drops parts the runner never writes — a planted file URL would be fetched', () => {
    const ui = toUiMessages([
      {
        id: 'u1',
        seq: 1,
        role: 'user',
        content: 'look',
        parts: [
          { type: 'text', text: 'look' },
          { type: 'file', mediaType: 'image/png', url: 'http://169.254.169.254/latest' },
        ],
      },
    ]);
    expect(ui[0]!.parts).toEqual([{ type: 'text', text: 'look' }]);
  });

  it('keeps a message that is only attachments', () => {
    const ui = toUiMessages([
      {
        id: 'u1',
        seq: 1,
        role: 'user',
        content: '',
        parts: [],
        attachments: [{ id: 'f1', url: '', name: 'a.png', media_type: 'image/png', size: 1, encrypted: false }],
      },
    ]);
    expect(ui.map((m) => m.id)).toEqual(['u1']);
  });
});

describe('small rules', () => {
  it('titles a conversation from the first line of its first message', () => {
    expect(titleFrom('  Plan dinners\nfor the week ')).toBe('Plan dinners');
    const long = titleFrom('x'.repeat(100));
    expect(long).toHaveLength(60);
    expect(long.endsWith('…')).toBe(true);
  });

  it('joins text parts for the plain content', () => {
    expect(
      textOfParts([
        { type: 'step-start' },
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ]),
    ).toBe('a\n\nb');
  });
});

describe('the conversation schema', () => {
  const [conversation, message] = chatResources;

  it('keeps a conversation private, 60 days past its last message, out of chat’s own tools', () => {
    expect(conversation).toMatchObject({
      access: { model: 'private' },
      retention: { days: 60, field: 'last_message_at' },
      modelTools: { chat: false },
    });
    expect(Object.keys(conversation!.customMethods ?? {})).toEqual(['cancel']);
  });

  it('nests messages under their conversation, which they inherit access from', () => {
    expect(message).toMatchObject({ parents: ['conversation'], user_settable_create: true });
    expect(message!.independent_access).toBeUndefined();
  });

  it('passes boot validation', () => {
    for (const def of chatResources) expect(() => validateResourceDefinition(def)).not.toThrow();
  });
});

describe('approvals', () => {
  const call = { toolCallId: 'c1', toolName: 'notifications', input: { action: ':send' } };
  type Part = Record<string, unknown>;

  it('a step that stops for approval stores the call waiting on its approval id', () => {
    const parts = partsFromStep([
      { type: 'tool-call', ...call },
      { type: 'tool-approval-request', approvalId: 'a1', toolCall: call },
    ]) as Part[];
    expect(parts[1]).toMatchObject({ type: 'tool-notifications', state: 'approval-requested', approval: { id: 'a1' } });
    expect(pendingApproval(parts as UIMessage['parts'], 'a1')).toBe(parts[1]);
    expect(pendingApproval(parts as UIMessage['parts'], 'other')).toBeUndefined();
  });

  it("a resumed call's outcome lands on the part that asked, not a copy", () => {
    const parts = partsFromStep([
      { type: 'tool-call', ...call },
      { type: 'tool-approval-request', approvalId: 'a1', toolCall: call },
    ]);
    const waiting = parts[1] as Part;
    Object.assign(waiting, { state: 'approval-responded', approval: { id: 'a1', approved: true } });

    settleResumedCall(parts, { type: 'tool-result', toolCallId: 'c1', output: { result: { sent: true } } });
    expect(waiting).toMatchObject({ state: 'output-available', output: { result: { sent: true } } });
    expect(waiting.approval).toEqual({ id: 'a1', approved: true });

    // A later step mentioning the same call merges, it doesn't append.
    mergeStep(parts, [{ type: 'text', text: 'Done.' }]);
    expect(parts.filter((p) => (p as Part).toolCallId === 'c1')).toHaveLength(1);
    expect(textOfParts(parts)).toBe('Done.');
  });

  it("settles only calls that were waiting on their approval", () => {
    const parts = [{ type: 'tool-groceries', toolCallId: 'c2', state: 'input-available' }] as UIMessage['parts'];
    settleResumedCall(parts, { type: 'tool-result', toolCallId: 'c2', output: 1 });
    expect((parts[0] as Part).state).toBe('input-available');
  });

  it('an unanswered approval is denied when the person moves on', () => {
    const parts = [
      { type: 'tool-notifications', toolCallId: 'c1', state: 'approval-requested', approval: { id: 'a1' } },
      { type: 'tool-groceries', toolCallId: 'c2', state: 'output-available' },
    ] as unknown as UIMessage['parts'];
    expect(denyPendingApprovals(parts)).toBe(true);
    expect(parts[0]).toMatchObject({ state: 'output-denied', approval: { id: 'a1', approved: false } });
    expect(denyPendingApprovals(parts)).toBe(false);
  });

  it('a denied call reaches the model as denied', async () => {
    const ui = toUiMessages([
      { id: 'u', seq: 1, role: 'user', parts: [{ type: 'text', text: 'tell Sam' }] },
      {
        id: 'a',
        seq: 2,
        role: 'assistant',
        parts: [
          {
            type: 'tool-notifications',
            toolCallId: 'c1',
            state: 'output-denied',
            input: { action: ':send' },
            approval: { id: 'a1', approved: false },
          },
        ] as unknown as UIMessage['parts'],
      },
    ]);
    const model = await convertToModelMessages(ui);
    expect(JSON.stringify(model)).toContain('c1');
  });
});
