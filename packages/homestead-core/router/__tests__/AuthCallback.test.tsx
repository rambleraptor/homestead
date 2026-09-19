/**
 * Tests for the OAuth callback page: fragment parsing → completeOAuthLogin on
 * success, friendly error copy on failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthCallback } from '../AuthCallback';

const completeOAuthLogin = vi.fn();
const navigate = vi.fn();

vi.mock('@rambleraptor/homestead-core/auth/useAuth', () => ({
  useAuth: () => ({ completeOAuthLogin }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function setHash(hash: string) {
  window.location.hash = hash;
}

describe('AuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completeOAuthLogin.mockResolvedValue(undefined);
    window.sessionStorage.clear();
    setHash('');
  });

  it('completes login from the fragment session and navigates to the dashboard', async () => {
    setHash('#access_token=tok-1&refresh_token=ref-1&expires_in=3600');

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(completeOAuthLogin).toHaveBeenCalledWith({
        accessToken: 'tok-1',
        refreshToken: 'ref-1',
        expiresIn: 3600,
      }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
  });

  it('navigates to the return path the login page parked before the OAuth hop', async () => {
    // An app installed to the home screen launches at its own path; the login
    // page parks that path before leaving for the provider.
    window.sessionStorage.setItem('homestead:oauth-return-url', '/todos');
    setHash('#access_token=tok-1&refresh_token=ref-1&expires_in=3600');

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/todos', { replace: true }));
    expect(window.sessionStorage.getItem('homestead:oauth-return-url')).toBeNull();
  });

  it('still accepts a bare `token` alias from an older server', async () => {
    setHash('#token=legacy-1');

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(completeOAuthLogin).toHaveBeenCalledWith({
        accessToken: 'legacy-1',
        refreshToken: undefined,
        expiresIn: undefined,
      }),
    );
  });

  it('shows an error when the token is missing', async () => {
    setHash('#');

    render(
      <MemoryRouter>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('oauth-callback-error')).toBeInTheDocument();
    expect(completeOAuthLogin).not.toHaveBeenCalled();
  });
});
