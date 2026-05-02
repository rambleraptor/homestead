'use client';

/**
 * Login Page
 *
 * Authentication page for user login. Uses the Homestead design system:
 * brand-navy accents, Outfit display font for the title, Inter body
 * font everywhere else, and a pearl/white panel instead of a bold
 * gradient so the login surface matches the rest of the app.
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../auth/useAuth';
import { Home, Mail, Lock, AlertCircle } from 'lucide-react';

export function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace(decodeURIComponent(returnUrl));
    }
  }, [isAuthenticated, isLoading, router, returnUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login({ email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  // Show nothing while redirecting
  if (isAuthenticated && !isLoading) {
    return null;
  }

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
            Sign in to access your home dashboard
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-surface-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
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
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
