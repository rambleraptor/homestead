/**
 * Tests for the OAuth consent page: loads the request info, posts the user's
 * decision (Bearer-authenticated) and navigates to the server-formed redirect,
 * and bounces a signed-out user to login.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { Authorize } from '../Authorize';

let authValue: { isAuthenticated: boolean; isLoading: boolean; token: string | null };

vi.mock('@rambleraptor/homestead-core/auth/useAuth', () => ({
  useAuth: () => authValue,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderAt(requestId: string) {
  return render(
    <MemoryRouter initialEntries={[`/authorize?request=${requestId}`]}>
      <Routes>
        <Route path="/authorize" element={<Authorize />} />
        <Route path="/login" element={<div data-testid="login-page">login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Authorize (consent page)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    authValue = { isAuthenticated: true, isLoading: false, token: 'session-tok' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    vi.unstubAllGlobals();
  });

  it('shows the client name and navigates to the redirect on approve', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/oauth2/authorize/info')) {
        return jsonResponse({ client_name: 'Test App', scopes: ['homestead'] });
      }
      if (String(url).includes('/oauth2/authorize/decision')) {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
        expect(JSON.parse(String(init?.body))).toEqual({ request: 'req-1', approve: true });
        return jsonResponse({ redirect: 'https://client.example/cb?code=abc&state=st' });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('req-1');
    expect(await screen.findByText('Test App')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('oauth-approve'));
    await waitFor(() =>
      expect(window.location.href).toBe('https://client.example/cb?code=abc&state=st'),
    );
  });

  it('sends approve:false on deny', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/oauth2/authorize/info')) {
        return jsonResponse({ client_name: 'Test App', scopes: [] });
      }
      expect(JSON.parse(String(init?.body)).approve).toBe(false);
      return jsonResponse({ redirect: 'https://client.example/cb?error=access_denied' });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAt('req-1');
    fireEvent.click(await screen.findByTestId('oauth-deny'));
    await waitFor(() =>
      expect(window.location.href).toBe('https://client.example/cb?error=access_denied'),
    );
  });

  it('redirects a signed-out user to login', async () => {
    authValue = { isAuthenticated: false, isLoading: false, token: null };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({})),
    );
    renderAt('req-1');
    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
  });
});
