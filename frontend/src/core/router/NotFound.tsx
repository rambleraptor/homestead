/**
 * 404 Not Found Page
 */

import Link from 'next/link';
import { Home, ArrowLeft } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-bg-pearl rounded-2xl mb-6">
          <Home className="w-10 h-10 text-text-muted" />
        </div>
        <h1 className="text-6xl font-display font-bold text-brand-navy mb-4 tracking-tight">
          404
        </h1>
        <h2 className="text-2xl font-display font-semibold text-brand-slate mb-2">
          Page Not Found
        </h2>
        <p className="font-body text-text-muted mb-8 max-w-md">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 font-body font-medium bg-accent-terracotta text-white rounded-lg hover:bg-accent-terracotta-hover transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
