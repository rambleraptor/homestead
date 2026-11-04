/**
 * Tests for the shared `QueryError`.
 *
 * It must announce (role alert), speak in the server's own words through the
 * shared error → message mapping, and offer Retry only when there is
 * something to retry with.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryError } from '../QueryError';

describe('QueryError', () => {
  it('announces the error in the server’s words', () => {
    render(<QueryError error={new Error('resource "todo" not found')} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load this');
    expect(alert).toHaveTextContent('resource "todo" not found');
    expect(alert).toHaveAttribute('data-testid', 'query-error');
  });

  it('falls back to a generic message for a value it cannot read', () => {
    render(<QueryError error={{ odd: true }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
  });

  it('shows Retry only when given something to retry with', async () => {
    const { rerender } = render(<QueryError error="nope" />);
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();

    const onRetry = vi.fn();
    rerender(<QueryError error="nope" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('takes a title and test id of the caller’s, and the compact size', () => {
    render(
      <QueryError error="nope" title="Couldn’t load your devices" compact data-testid="devices-error" />,
    );
    const alert = screen.getByTestId('devices-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Couldn’t load your devices');
    expect(alert).toHaveTextContent('nope');
  });
});
