/**
 * 500 Internal Error Page
 *
 * Rendered by Next.js `error.tsx` boundaries when a route throws. In
 * development we surface the error message + digest so the failure can be
 * diagnosed without digging through logs; in production we keep the message
 * generic.
 */

'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react';

interface InternalErrorProps {
  error: Error & { digest?: string };
  reset?: () => void;
}

export function InternalError({ error, reset }: InternalErrorProps) {
  const showDetails = process.env.NODE_ENV !== 'production';

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-xl">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-red-50 rounded-2xl mb-6">
          <AlertTriangle className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-6xl font-display font-bold text-brand-navy mb-4 tracking-tight">
          500
        </h1>
        <h2 className="text-2xl font-display font-semibold text-brand-slate mb-2">
          Something went wrong
        </h2>
        <p className="font-body text-text-muted mb-8 max-w-md mx-auto">
          An unexpected error happened while rendering this page. You can try
          again or head back to the dashboard.
        </p>

        {showDetails && (error.message || error.digest) && (
          <div className="text-left mb-8 bg-red-50/40 border border-red-200 rounded-lg p-4">
            <p className="font-mono text-xs uppercase tracking-wide text-red-700 mb-1">
              Error details
            </p>
            {error.message && (
              <p className="font-mono text-sm text-red-900 whitespace-pre-wrap break-words">
                {error.message}
              </p>
            )}
            {error.digest && (
              <p className="font-mono text-xs text-red-700 mt-2">
                digest: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3">
          {reset && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 px-6 py-3 font-body font-medium bg-accent-terracotta text-white rounded-lg hover:bg-accent-terracotta-hover transition-colors shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Try again
            </button>
          )}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 font-body font-medium bg-white text-brand-navy rounded-lg hover:bg-bg-pearl transition-colors shadow-sm border border-gray-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
