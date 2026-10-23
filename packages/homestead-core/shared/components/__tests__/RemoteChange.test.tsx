import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RemoteChange } from '../../../api/remoteChanges';
import { RemoteChangeBadge, RemoteEditNotice, remoteChangeClass } from '../RemoteChange';

function change(overrides: Partial<RemoteChange> = {}): RemoteChange {
  return {
    kind: 'updated',
    resource: 'recipe',
    id: 'r1',
    path: 'recipes/r1',
    actor: 'users/sam',
    actorName: 'Sam',
    byMe: false,
    time: '2026-10-22T00:00:00Z',
    ...overrides,
  };
}

describe('remoteChangeClass', () => {
  it('always carries the transition, and tints only while there is a change', () => {
    expect(remoteChangeClass(undefined)).toContain('transition-[background-color,opacity]');
    expect(remoteChangeClass(undefined)).not.toContain('bg-accent-terracotta');
    expect(remoteChangeClass(change())).toContain('bg-accent-terracotta/10');
  });
});

describe('RemoteChangeBadge', () => {
  it('names who changed the row, and renders nothing otherwise', () => {
    const { rerender } = render(<RemoteChangeBadge change={change()} />);
    expect(screen.getByTestId('remote-change-badge')).toHaveTextContent('Just changed by Sam');

    rerender(<RemoteChangeBadge change={change({ actorName: null })} />);
    expect(screen.getByTestId('remote-change-badge')).toHaveTextContent('Someone');

    rerender(<RemoteChangeBadge change={undefined} />);
    expect(screen.queryByTestId('remote-change-badge')).toBeNull();
  });
});

describe('RemoteEditNotice', () => {
  it('offers to load the saved version or keep editing', async () => {
    const onReload = vi.fn();
    const onDismiss = vi.fn();
    render(
      <RemoteEditNotice change={change()} noun="recipe" onReload={onReload} onDismiss={onDismiss} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Sam saved changes to this recipe while you were editing it.',
    );
    await userEvent.click(screen.getByRole('button', { name: /load saved version/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep mine/i }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('says so when the record was deleted, with nothing to load', () => {
    render(
      <RemoteEditNotice
        change={change({ kind: 'deleted' })}
        noun="recipe"
        onReload={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Sam deleted this recipe');
    expect(screen.queryByRole('button', { name: /load saved version/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('points at the other device when it was the signed-in user', () => {
    render(<RemoteEditNotice change={change({ byMe: true })} noun="recipe" onDismiss={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'You saved changes to this recipe on another device',
    );
  });
});
