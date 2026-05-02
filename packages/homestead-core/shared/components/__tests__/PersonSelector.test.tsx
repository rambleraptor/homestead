import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonSelector } from '../PersonSelector';

const PEOPLE = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Carol' },
];

function ControlledHarness({
  initial = [],
  onChangeSpy,
}: {
  initial?: string[];
  onChangeSpy?: (next: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  return (
    <PersonSelector
      people={PEOPLE}
      isSelected={(id) => selected.includes(id)}
      onToggle={(id) =>
        setSelected((prev) => {
          const next = prev.includes(id)
            ? prev.filter((x) => x !== id)
            : [...prev, id];
          onChangeSpy?.(next);
          return next;
        })
      }
      containerTestId="picker"
      itemTestId={(id) => `picker-${id}`}
    />
  );
}

describe('PersonSelector', () => {
  it('renders a button per person', () => {
    render(
      <PersonSelector
        people={PEOPLE}
        isSelected={() => false}
        onToggle={() => {}}
        itemTestId={(id) => `picker-${id}`}
      />,
    );
    expect(screen.getByTestId('picker-a')).toBeInTheDocument();
    expect(screen.getByTestId('picker-b')).toBeInTheDocument();
    expect(screen.getByTestId('picker-c')).toBeInTheDocument();
  });

  it('reflects selection via aria-pressed', () => {
    render(
      <PersonSelector
        people={PEOPLE}
        isSelected={(id) => id === 'b'}
        onToggle={() => {}}
        itemTestId={(id) => `picker-${id}`}
      />,
    );
    expect(screen.getByTestId('picker-a')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('picker-b')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('calls onToggle with the person id when clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <PersonSelector
        people={PEOPLE}
        isSelected={() => false}
        onToggle={onToggle}
        itemTestId={(id) => `picker-${id}`}
      />,
    );
    await user.click(screen.getByTestId('picker-a'));
    expect(onToggle).toHaveBeenCalledWith('a');
  });

  it('toggles selection on repeated clicks (controlled harness)', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);
    const btn = screen.getByTestId('picker-a');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('filters the visible list by the search query', async () => {
    const user = userEvent.setup();
    render(
      <PersonSelector
        people={PEOPLE}
        isSelected={() => false}
        onToggle={() => {}}
        containerTestId="picker"
        itemTestId={(id) => `picker-${id}`}
      />,
    );
    await user.type(screen.getByTestId('picker-search'), 'ali');
    expect(screen.getByTestId('picker-a')).toBeInTheDocument();
    expect(screen.queryByTestId('picker-b')).not.toBeInTheDocument();
    expect(screen.queryByTestId('picker-c')).not.toBeInTheDocument();
  });

  it('matches case-insensitively and on substrings', async () => {
    const user = userEvent.setup();
    render(
      <PersonSelector
        people={PEOPLE}
        isSelected={() => false}
        onToggle={() => {}}
        containerTestId="picker"
        itemTestId={(id) => `picker-${id}`}
      />,
    );
    await user.type(screen.getByTestId('picker-search'), 'AR');
    // "Carol" contains "ar"
    expect(screen.getByTestId('picker-c')).toBeInTheDocument();
    expect(screen.queryByTestId('picker-a')).not.toBeInTheDocument();
  });

  it('preserves selection state for filtered-out rows', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);
    await user.click(screen.getByTestId('picker-a')); // select Alice
    await user.type(screen.getByTestId('picker-search'), 'bob');
    expect(screen.queryByTestId('picker-a')).not.toBeInTheDocument();
    // Clear the filter — Alice should still be selected.
    await user.clear(screen.getByTestId('picker-search'));
    expect(screen.getByTestId('picker-a')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows an empty-state message when no rows match', async () => {
    const user = userEvent.setup();
    render(
      <PersonSelector
        people={PEOPLE}
        isSelected={() => false}
        onToggle={() => {}}
        containerTestId="picker"
        itemTestId={(id) => `picker-${id}`}
      />,
    );
    await user.type(screen.getByTestId('picker-search'), 'zzz');
    expect(screen.getByTestId('picker-empty')).toBeInTheDocument();
  });

  it('renders the empty fallback when there are no people at all', () => {
    render(
      <PersonSelector
        people={[]}
        isSelected={() => false}
        onToggle={() => {}}
        emptyMessage="Add some folks first."
      />,
    );
    expect(screen.getByText('Add some folks first.')).toBeInTheDocument();
  });

  it('renders a loading state', () => {
    const { container } = render(
      <PersonSelector
        people={PEOPLE}
        isSelected={() => false}
        onToggle={() => {}}
        loading
      />,
    );
    expect(container.querySelector('svg.animate-spin')).toBeInTheDocument();
  });
});
