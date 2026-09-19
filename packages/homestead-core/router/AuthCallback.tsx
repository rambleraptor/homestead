/**
 * OAuth callback page
 *
 * The federated callback finishes the authorization-code exchange and
 * 302-redirects the browser here with the session in the URL *fragment* (so it
 * never lands in server logs or the Referer header):
 *
 *   /auth/callback#access_token=…&refresh_token=…&expires_in=…   (success)
 *
 * (`token` is also sent as an alias for the access token so older builds keep
 * working.) On success we hand the session to AuthContext (which resolves the
 * user via the whoami endpoint and hydrates preferences, same as password
 * login) and navigate to wherever the login page parked as the return path
 * (`oauthReturn.ts`) — the dashboard when nothing was parked. Provider /
 * registration failures are rendered by the callback as a JSON error before
 * this page loads, so here we only need to handle a missing token.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { takeOAuthReturnUrl } from '../auth/oauthReturn';
import { Home, AlertCircle } from 'lucide-react';

function parseFragment(): URLSearchParams {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

export function AuthCallback() {
  const { completeOAuthLogin } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = parseFragment();
    const accessToken = params.get('access_token') ?? params.get('token');

    if (!accessToken) {
      setError('Sign-in failed: the response was missing a token. Please try again.');
      return;
    }

    const refreshToken = params.get('refresh_token') ?? undefined;
    const expiresInRaw = params.get('expires_in');
    const expiresIn = expiresInRaw ? Number(expiresInRaw) : undefined;

    let active = true;
    completeOAuthLogin({ accessToken, refreshToken, expiresIn })
      .then(() => {
        if (active) navigate(takeOAuthReturnUrl() ?? '/dashboard', { replace: true });
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to complete sign-in.');
        }
      });
    return () => {
      active = false;
    };
  }, [completeOAuthLogin, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-pearl px-4 py-12">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-surface-white rounded-2xl shadow-sm mb-4">
          <Home className="w-8 h-8 text-brand-navy" />
        </div>
        {error ? (
          <div
            className="bg-surface-white rounded-2xl border border-gray-100 shadow-sm p-8"
            data-testid="oauth-callback-error"
          >
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm font-body text-red-600 text-left">{error}</p>
            </div>
            <a
              href="/login"
              className="inline-block w-full py-3 px-4 rounded-lg text-base font-body font-semibold text-white bg-accent-terracotta hover:bg-accent-terracotta-hover transition-colors"
            >
              Back to sign in
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-text-muted">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-navy" />
            <p className="font-body">Signing you in…</p>
          </div>
        )}
      </div>
    </div>
  );
}
