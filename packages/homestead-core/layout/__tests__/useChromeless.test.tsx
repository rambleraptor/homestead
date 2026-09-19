import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useChromeless } from '../useChromeless';

function setup(initialPath: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  );
  return renderHook(() => ({ chromeless: useChromeless(), navigate: useNavigate() }), {
    wrapper,
  });
}

describe('useChromeless', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('is off by default', () => {
    expect(setup('/todos').result.current.chromeless).toBe(false);
  });

  it('turns on for ?chrome=none, from the first render', () => {
    expect(setup('/todos?chrome=none').result.current.chromeless).toBe(true);
  });

  it('sticks across client-side navigation that drops the query string', () => {
    const { result } = setup('/todos?chrome=none');
    act(() => result.current.navigate('/todos/abc'));
    expect(result.current.chromeless).toBe(true);
    act(() => result.current.navigate('/groceries'));
    expect(result.current.chromeless).toBe(true);
  });

  it('survives a fresh mount in the same session', () => {
    setup('/todos?chrome=none');
    expect(setup('/todos').result.current.chromeless).toBe(true);
  });

  it('turns back off for ?chrome=full', () => {
    const { result } = setup('/todos?chrome=none');
    act(() => result.current.navigate('/todos?chrome=full'));
    expect(result.current.chromeless).toBe(false);
    act(() => result.current.navigate('/todos'));
    expect(result.current.chromeless).toBe(false);
  });
});
