/**
 * A reply never takes the page down with it: every state a tool call passes
 * through while it streams in renders (with its Details open), and a part that
 * does throw is replaced by the error, with the rest of the reply still there.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readUIMessageStream, type UIMessageChunk } from 'ai';
import type { AppConfig, ChatCardType } from '../../apps/types';
import { initializeAppRegistry, resetAppRegistry } from '../../apps/registry';
import { ToastProvider } from '../../shared/components/ToastProvider';
import { ChatMessage } from '../components/ChatMessage';
import type { HomesteadUIMessage } from '../types';

const notes = {
  id: 'notes',
  name: 'Notes',
  resources: [{ singular: 'note', plural: 'notes', fields: { title: { type: 'string' } } }],
} as unknown as AppConfig;

/** An app whose chat card for a list throws as soon as it renders. */
const BROKEN_CARD = 'this card is broken';
const brokenCard = {
  component: () =>
    Promise.resolve(() => {
      throw new TypeError(BROKEN_CARD);
    }),
  actions: ['list'],
} as unknown as ChatCardType;
const broken = {
  id: 'broken',
  name: 'Broken',
  resources: [{ singular: 'gadget', plural: 'gadgets', fields: { title: { type: 'string' } } }],
  chat: { cards: { gadget: brokenCard } },
} as unknown as AppConfig;

type Part = HomesteadUIMessage['parts'][number];

const renderReply = (message: HomesteadUIMessage, streaming = false) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ToastProvider>
          <ChatMessage conversationId="c1" message={message} streaming={streaming} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );

/** Flush what a render queued (effects, resolved promises). */
const settle = () => act(async () => {});

/** Characters of a call's arguments per streamed piece: small enough to cut keys and values mid-word. */
const DELTA = 9;

/** A tool call as the stream delivers it: its arguments a piece at a time, then its result. */
function toolCall(id: string, tool: string, input: unknown, output: unknown): UIMessageChunk[] {
  const json = JSON.stringify(input);
  const deltas: UIMessageChunk[] = [];
  for (let i = 0; i < json.length; i += DELTA) {
    deltas.push({ type: 'tool-input-delta', toolCallId: id, inputTextDelta: json.slice(i, i + DELTA) });
  }
  return [
    { type: 'tool-input-start', toolCallId: id, toolName: tool },
    ...deltas,
    { type: 'tool-input-available', toolCallId: id, toolName: tool, input },
    { type: 'tool-output-available', toolCallId: id, output },
  ] as UIMessageChunk[];
}

describe('ChatMessage', () => {
  beforeEach(() => initializeAppRegistry([notes, broken]));
  afterEach(() => {
    cleanup();
    resetAppRegistry();
    vi.restoreAllMocks();
  });

  it('renders every state a streamed tool call passes through, Details open', async () => {
    // The cards read their records live; the mocked client answers nothing, which TanStack logs.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const made = { id: 'n1', title: 'Milk', path: 'notes/n1' };
    const chunks = [
      { type: 'start', messageId: 'm1' },
      { type: 'start-step' },
      ...toolCall('c1', 'notes', { action: 'create', fields: { title: 'Milk' } }, { result: made }),
      ...toolCall('c2', 'notes', { action: 'update', id: 'n1', fields: { title: 'Oat milk' } }, {
        result: { ...made, title: 'Oat milk' },
        previous: { title: 'Milk' },
      }),
      ...toolCall('c3', 'notes', { action: 'list' }, { result: { records: [made, { id: 'n2' }, null], count: 3 } }),
      ...toolCall('c4', 'notes', { action: 'get', id: 'nope' }, { error: 'not found' }),
      ...toolCall('c5', 'notes', { action: 'list' }, { truncated: true, size: 99999, preview: '{"result":{"rec' }),
      ...toolCall('c6', 'notes', { action: 'delete', id: 'n1' }, null),
      { type: 'finish-step' },
      { type: 'finish' },
    ] as UIMessageChunk[];
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });

    let states = 0;
    for await (const message of readUIMessageStream<HomesteadUIMessage>({ stream })) {
      states++;
      const view = renderReply(structuredClone(message), true);
      await settle();
      for (const toggle of view.container.querySelectorAll<HTMLElement>(
        '[data-testid="chat-tool-toggle"], [data-testid="chat-tool-rollup-toggle"]',
      )) {
        await act(async () => toggle.click());
      }
      await settle();
      expect(screen.queryByTestId('chat-part-error')).toBeNull();
      view.unmount();
    }
    // The first state of each call has no arguments at all yet.
    expect(states).toBeGreaterThan(20);
  }, 30_000);

  // Every reply's Markdown goes through rehype-raw (hast-util-raw driving
  // parse5's tokenizer). hast-util-raw 9.2.0 calls a tokenizer method only
  // parse5 >= 8.1.0 has while accepting 8.0.0, and an install that paired the
  // two threw on every reply — hence the pin in the root package.json.
  it('renders a Markdown reply, raw HTML included', async () => {
    const text = 'Here is **the plan**:\n\n- one\n- two\n\n<details><summary>More</summary>hidden</details>';
    renderReply({ id: 'm1', role: 'assistant', parts: [{ type: 'text', text }] } as HomesteadUIMessage);
    await settle();

    expect(screen.queryByTestId('chat-part-error')).toBeNull();
    expect(screen.getByText('the plan')).toBeTruthy();
  });

  it('shows the error in place of a part that throws, and keeps the rest of the reply', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const parts = [
      { type: 'tool-gadgets', toolCallId: 'c1', state: 'output-available', input: { action: 'list' }, output: { result: { records: [], count: 0 } } },
      { type: 'text', text: 'Here is what I found.' },
    ] as unknown as Part[];
    renderReply({ id: 'm1', role: 'assistant', parts } as HomesteadUIMessage);

    // The card is lazy: the error shows once it has loaded and thrown.
    expect((await screen.findByTestId('chat-part-error')).textContent).toContain(BROKEN_CARD);
    expect(screen.getByText('Here is what I found.')).toBeTruthy();
  });
});
