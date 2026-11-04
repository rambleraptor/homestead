/**
 * Tests for the shared `EmptyState`.
 *
 * The contract: an action spec becomes a button that fires, a node is
 * rendered as given, and the assistant link carries the prompt to the home's
 * `?ask=` — the one piece of routing in the component, and the one another
 * screen (the home) depends on reading back.
 */

import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { EmptyState, assistantPromptPath } from '../EmptyState';

function renderIn(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('EmptyState', () => {
  it('shows the title and description under the default test id', () => {
    renderIn(<EmptyState icon={Inbox} title="No todos yet" description="Add the first one." />);
    const state = screen.getByTestId('empty-state');
    expect(state).toHaveTextContent('No todos yet');
    expect(state).toHaveTextContent('Add the first one.');
    expect(screen.getByRole('heading', { name: 'No todos yet' })).toBeInTheDocument();
  });

  it('renders an action spec as a button that fires', async () => {
    const onClick = vi.fn();
    renderIn(
      <EmptyState
        icon={Inbox}
        title="No todos yet"
        action={{ label: 'Add a todo', onClick, testId: 'add-todo' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add a todo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('add-todo')).toBeInTheDocument();
  });

  it('renders a node action as given, alongside a secondary spec', () => {
    renderIn(
      <EmptyState
        icon={Inbox}
        title="No todos yet"
        action={<a href="/todos/new">Open the form</a>}
        secondaryAction={{ label: 'Import', onClick: () => {} }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Open the form' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('links to the home with the prompt filled in', () => {
    renderIn(<EmptyState icon={Inbox} title="No todos yet" assistantPrompt="Add my first todo" />);
    const link = screen.getByRole('link', { name: /ask the assistant/i });
    expect(link).toHaveAttribute('href', '/dashboard?ask=Add%20my%20first%20todo');
    expect(link).toHaveAttribute('data-testid', 'empty-state-ask');
  });

  it('offers no assistant link without a prompt', () => {
    renderIn(<EmptyState icon={Inbox} title="No todos yet" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('encodes the prompt for the address', () => {
    expect(assistantPromptPath('What is due & when?')).toBe('/dashboard?ask=What%20is%20due%20%26%20when%3F');
  });

  it('marks the compact size and takes a custom test id', () => {
    renderIn(<EmptyState icon={Inbox} title="Nothing here" compact data-testid="widget-empty" />);
    const state = screen.getByTestId('widget-empty');
    expect(state).toHaveAttribute('data-compact', 'true');
    // Compact lives inside a widget that already has a heading; it mustn't add one.
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
