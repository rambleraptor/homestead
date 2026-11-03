/**
 * OAuth consent page (Homestead as authorization server).
 *
 * The AS `/oauth2/authorize` endpoint validates the request, stashes it, and
 * redirects the browser here as `/authorize?request=<handle>`. Hosting consent
 * in the SPA (rather than a server-rendered page) means it reuses the user's
 * existing session — and, for a signed-out user, the normal login screen with
 * its federated buttons, so password-less OAuth users can authorize too.
 *
 * On approve/deny we POST the decision (Bearer-authenticated with the session's
 * access token); the server returns the fully-formed redirect back to the
 * client app, which we navigate to.
 */

import { useEffect, useState } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { aepbase } from '../api/aepbase';
import { Home, AlertCircle, ShieldCheck } from 'lucide-react';

interface RequestInfo {
  client_name: string | null;
  scopes: string[];
}

export function Authorize() {
  const { isAuthenticated, isLoading } = useAuth();
  const [params] = useSearchParams();
  const requestId = params.get('request') ?? '';

  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!requestId) {
      setError('This authorization link is missing its request reference.');
      return;
    }
    // Only load once we know the user is signed in (avoids a flash before the
    // login redirect below takes effect).
    if (isLoading || !isAuthenticated) return;
    let active = true;
    fetch(`/oauth2/authorize/info?request=${encodeURIComponent(requestId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('This authorization request is invalid or has expired.');
        return (await res.json()) as RequestInfo;
      })
      .then((body) => {
        if (active) setInfo(body);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load the request.');
      });
    return () => {
      active = false;
    };
  }, [requestId, isAuthenticated, isLoading]);

  // Signed-out users go through the normal login (password or federated) and
  // return here afterwards.
  if (!isLoading && !isAuthenticated) {
    const returnUrl = encodeURIComponent(`/authorize?request=${requestId}`);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  const decide = async (approve: boolean) => {
    setSubmitting(true);
    setError('');
    try {
      const res = await aepbase.authorizedFetch('/oauth2/authorize/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: requestId, approve }),
      });
      if (!res.ok) throw new Error('Could not complete authorization. Please try again.');
      const body = (await res.json()) as { redirect: string };
      // Hand control back to the client app at the server-formed redirect.
      window.location.href = body.redirect;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authorization failed.');
      setSubmitting(false);
    }
  };

  const appName = info?.client_name || 'An application';

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-pearl px-4 py-12">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-surface-white rounded-2xl shadow-sm mb-4">
          <Home className="w-8 h-8 text-brand-navy" />
        </div>
        <div
          className="bg-surface-white rounded-2xl border border-gray-100 shadow-sm p-8"
          data-testid="oauth-consent"
        >
          {error ? (
            <div
              className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg"
              data-testid="oauth-consent-error"
            >
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm font-body text-red-600 text-left">{error}</p>
            </div>
          ) : !info ? (
            <div className="flex flex-col items-center gap-3 text-text-muted">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-navy" />
              <p className="font-body">Loading…</p>
            </div>
          ) : (
            <>
              <ShieldCheck className="w-10 h-10 text-brand-navy mx-auto mb-3" />
              <h1 className="text-2xl font-display font-bold text-brand-navy tracking-tight">
                Authorize access
              </h1>
              <p className="text-base font-body text-text-muted mt-2">
                <span className="font-semibold text-text-main">{appName}</span> wants to access
                your Homestead account and act on your behalf.
              </p>
              {info.scopes.length > 0 && (
                <ul className="mt-4 text-left text-sm font-body text-text-muted list-disc list-inside">
                  {info.scopes.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  data-testid="oauth-approve"
                  disabled={submitting}
                  onClick={() => decide(true)}
                  className="w-full py-3 px-4 rounded-lg text-base font-body font-semibold text-white bg-accent-terracotta hover:bg-accent-terracotta-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Authorizing…' : 'Allow'}
                </button>
                <button
                  type="button"
                  data-testid="oauth-deny"
                  disabled={submitting}
                  onClick={() => decide(false)}
                  className="w-full py-3 px-4 rounded-lg text-base font-body font-semibold text-brand-navy border border-gray-200 bg-surface-white hover:bg-bg-pearl disabled:opacity-50 transition-colors"
                >
                  Deny
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
