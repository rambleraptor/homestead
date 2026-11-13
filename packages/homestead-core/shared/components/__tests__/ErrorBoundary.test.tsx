import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary, RenderError } from '../ErrorBoundary';

function Thrower({ fail }: { fail: boolean }) {
  if (fail) throw new TypeError('Cannot read properties of undefined');
  return <p>fine</p>;
}

const fallback = (error: Error) => <RenderError error={error} title="Couldn’t show this" />;

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the fallback with the error as thrown, and keeps its siblings', () => {
    render(
      <>
        <p>beside</p>
        <ErrorBoundary fallback={fallback}>
          <Thrower fail />
        </ErrorBoundary>
      </>,
    );
    // The message itself, not a rephrasing: a render TypeError isn't a network error.
    expect(screen.getByTestId('render-error').textContent).toContain('Cannot read properties of undefined');
    expect(screen.getByText('beside')).toBeTruthy();
  });

  it('stays on the fallback across re-renders until its reset key changes', () => {
    const view = render(
      <ErrorBoundary resetKey="a" fallback={fallback}>
        <Thrower fail />
      </ErrorBoundary>,
    );
    view.rerender(
      <ErrorBoundary resetKey="a" fallback={fallback}>
        <Thrower fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('render-error')).toBeTruthy();

    view.rerender(
      <ErrorBoundary resetKey="b" fallback={fallback}>
        <Thrower fail={false} />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId('render-error')).toBeNull();
    expect(screen.getByText('fine')).toBeTruthy();
  });
});
