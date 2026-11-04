/**
 * The frame the Health app's form pages share: a link back to the Health
 * home, a heading, and the white card the form sits in — plus the error
 * panel shown when the record the address names can't be loaded (which,
 * since health records are private, includes someone else's id).
 */

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';

/** Not `/health` — that path is server-owned; see `app.config.ts`. */
export const HEALTH_HOME = '/health-records';

/** Where a dose form returns to, with the series it touched held open. */
export interface HealthHomeLinkState {
  expand?: string;
}

export function HealthFormPage({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6" data-testid={testId}>
      <BackToHealth />
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-brand-navy mb-6">{title}</h2>
        <div className="bg-surface-white rounded-2xl shadow-md p-6 border border-gray-100">{children}</div>
      </div>
    </div>
  );
}

export function HealthLoadError({
  noun,
  error,
  onRetry,
}: {
  noun: string;
  error: unknown;
  /** The failed query's `refetch`; omitted when the record simply isn't there. */
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-4">
      <BackToHealth />
      <QueryError
        error={error ?? `${capitalize(noun)} not found`}
        onRetry={error ? onRetry : undefined}
        title={`Failed to load ${noun}`}
        data-testid="health-load-error"
      />
    </div>
  );
}

function BackToHealth() {
  return (
    <Link
      to={HEALTH_HOME}
      data-testid="health-form-back"
      className="inline-flex items-center gap-1 text-sm text-brand-slate hover:text-brand-navy"
    >
      <ArrowLeft className="w-4 h-4" />
      Back to health
    </Link>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
