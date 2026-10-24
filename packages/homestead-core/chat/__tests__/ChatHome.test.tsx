import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatHome } from '../components/ChatHome';
import * as useChatMod from '../hooks/useChat';

function mockChat(over: Partial<ReturnType<typeof useChatMod.useChat>>) {
  vi.spyOn(useChatMod, 'useChat').mockReturnValue({
    messages: [],
    pending: false,
    error: null,
    notConfigured: false,
    send: vi.fn(),
    ...over,
  });
}

describe('ChatHome', () => {
  it('renders empty state + composer', () => {
    mockChat({});
    render(<ChatHome />);
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    expect(screen.getByText(/Start a conversation/i)).toBeInTheDocument();
  });

  it('renders bubbles + tool markers + pending', () => {
    mockChat({
      messages: [
        { role: 'user', content: 'add milk to groceries' },
        {
          role: 'assistant',
          content: 'Done! Added milk.',
          toolCalls: [
            { tool: 'groceries', args: { action: 'create', fields: { name: 'milk' } }, ok: true },
            { tool: 'todos', args: { action: 'list' }, ok: false, error: 'boom' },
            { tool: 'search_documents', args: { query: 'tax' }, ok: true },
          ],
        },
      ],
      pending: true,
    });
    render(<ChatHome />);
    expect(screen.getByText('add milk to groceries')).toBeInTheDocument();
    expect(screen.getByText('Done! Added milk.')).toBeInTheDocument();
    expect(screen.getByText('groceries')).toBeInTheDocument();
    expect(screen.getByText('todos')).toBeInTheDocument();
    // The verb rides on the marker next to the resource it touched.
    expect(screen.getAllByTestId('chat-tool-action').map((el) => el.textContent)).toEqual([
      'create',
      'list',
    ]);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    // A tool without an action (document search) shows just its name.
    expect(screen.getByText('search_documents')).toBeInTheDocument();
    expect(screen.getByTestId('chat-pending')).toBeInTheDocument();
  });
});
