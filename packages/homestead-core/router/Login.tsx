/**
 * Login Page
 *
 * Authentication page for user login. Uses the Homestead design system:
 * brand-navy accents, Outfit display font for the title, Inter body
 * font everywhere else, and a pearl/white panel instead of a bold
 * gradient so the login surface matches the rest of the app.
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { rememberOAuthReturnUrl } from '../auth/oauthReturn';
import { aepbase, type OAuthProvider } from '../api/aepbase';
import { Home, Mail, Lock, AlertCircle, Check, User } from 'lucide-react';

export function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/dashboard';

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  // First visit to a fresh instance: no admin account exists yet, so render
  // a create-your-account form instead of the sign-in form.
  const [needsSetup, setNeedsSetup] = useState(false);
  // Before the create-admin form, show a one-screen intro explaining what
  // Homestead is — this is the very first time anyone has opened this instance.
  const [setupIntroSeen, setSetupIntroSeen] = useState(false);

  useEffect(() => {
    let active = true;
    aepbase
      .listOAuthProviders()
      .then((list) => {
        if (active) setProviders(list);
      })
      .catch(() => {
        // No providers / OAuth disabled — leave the list empty.
      });
    fetch('/api/setup')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { needsSetup?: boolean } | null) => {
        if (active && body?.needsSetup) setNeedsSetup(true);
      })
      .catch(() => {
        // Endpoint unreachable — assume a normal sign-in.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate(decodeURIComponent(returnUrl), { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, returnUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (needsSetup && password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      if (needsSetup) {
        const trimmedName = displayName.trim();
        const res = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            ...(trimmedName ? { display_name: trimmedName } : {}),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'Failed to create the admin account');
        }
        setNeedsSetup(false);
      }
      await login({ email, password });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : needsSetup
            ? 'Failed to create the admin account'
            : 'Failed to login',
      );
    } finally {
      setLoading(false);
    }
  };

  // Show nothing while redirecting
  if (isAuthenticated && !isLoading) {
    return null;
  }

  const showSetupIntro = needsSetup && !setupIntroSeen;

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-pearl px-4 py-12">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-surface-white rounded-2xl shadow-sm mb-4">
            <Home className="w-8 h-8 text-brand-navy" />
          </div>
          <h1 className="text-3xl font-display font-bold text-brand-navy tracking-tight">
            Welcome to Homestead
          </h1>
          <p className="text-base font-body text-text-muted mt-1">
            {showSetupIntro
              ? "Let's get your household set up"
              : needsSetup
                ? 'Create the admin account for this new instance'
                : 'Sign in to access your home dashboard'}
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-surface-white rounded-2xl border border-gray-100 shadow-sm p-8">
          {showSetupIntro ? (
            <div data-testid="setup-intro" className="space-y-6">
              <div className="space-y-4 text-sm font-body text-text-main">
                <p>
                  Homestead is your household&apos;s private home base — a
                  self-hosted collection of small apps for the things your
                  family keeps track of together, with all the data living on
                  your own server.
                </p>
                <ul className="space-y-2">
                  {[
                    'Track recipes, gift cards, to-dos, events and more — together.',
                    'Everyone in your household shares one home dashboard.',
                    'Your data stays on your hardware; nothing leaves your server.',
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-terracotta" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-text-muted">
                  You&apos;re the first one here. Next, you&apos;ll create the
                  admin account that owns this instance.
                </p>
              </div>
              <button
                type="button"
                data-testid="setup-get-started"
                onClick={() => setSetupIntroSeen(true)}
                className="w-full flex justify-center py-3 px-4 rounded-lg shadow-sm text-base font-body font-semibold text-white bg-accent-terracotta hover:bg-accent-terracotta-hover focus:outline-none focus:ring-2 focus:ring-accent-terracotta/40 focus:ring-offset-1 transition-colors"
              >
                Get started
              </button>
            </div>
          ) : (
          <>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Display name (first-visit setup only, optional) */}
            {needsSetup && (
              <div>
                <label
                  htmlFor="display-name"
                  className="block text-sm font-body font-medium text-brand-navy mb-2"
                >
                  Display name{' '}
                  <span className="font-normal text-text-muted">(optional)</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-text-muted" />
                  </div>
                  <input
                    id="display-name"
                    type="text"
                    data-testid="setup-display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg bg-surface-white font-body text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-terracotta/40 focus:border-accent-terracotta"
                    placeholder="e.g. Alex"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-body font-medium text-brand-navy mb-2"
              >
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-text-muted" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg bg-surface-white font-body text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-terracotta/40 focus:border-accent-terracotta"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-body font-medium text-brand-navy mb-2"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-text-muted" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg bg-surface-white font-body text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-terracotta/40 focus:border-accent-terracotta"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Confirm password (first-visit setup only) */}
            {needsSetup && (
              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-body font-medium text-brand-navy mb-2"
                >
                  Confirm password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-text-muted" />
                  </div>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    data-testid="setup-confirm-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg bg-surface-white font-body text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-terracotta/40 focus:border-accent-terracotta"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm font-body text-red-600">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || isLoading}
              className="w-full flex justify-center py-3 px-4 rounded-lg shadow-sm text-base font-body font-semibold text-white bg-accent-terracotta hover:bg-accent-terracotta-hover focus:outline-none focus:ring-2 focus:ring-accent-terracotta/40 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading || isLoading ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {needsSetup ? 'Creating account...' : 'Signing in...'}
                </span>
              ) : needsSetup ? (
                'Create Admin Account'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* OAuth / OIDC providers (hidden during first-visit setup) */}
          {!needsSetup && providers.length > 0 && (
            <div className="mt-6" data-testid="oauth-providers">
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-surface-white px-2 text-sm font-body text-text-muted">
                    or
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                {providers.map((provider) => (
                  <button
                    key={provider.name}
                    type="button"
                    data-testid={`oauth-${provider.name}`}
                    onClick={() => {
                      // The callback page can't see this page's query string
                      // after the provider round-trip; park the destination.
                      rememberOAuthReturnUrl(decodeURIComponent(returnUrl));
                      aepbase.startOAuth(provider.name);
                    }}
                    className="w-full flex justify-center py-3 px-4 rounded-lg border border-gray-200 bg-surface-white text-base font-body font-semibold text-brand-navy hover:bg-bg-pearl focus:outline-none focus:ring-2 focus:ring-accent-terracotta/40 focus:ring-offset-1 transition-colors"
                  >
                    Sign in with {provider.display_name}
                  </button>
                ))}
              </div>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
