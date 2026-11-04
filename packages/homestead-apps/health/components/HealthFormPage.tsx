/**
 * The frame the Health app's form pages share: a link back to the Health
 * home, a heading, and the white card the form sits in — plus the error
 * panel shown when the record the address names can't be loaded (which,
 * since health records are private, includes someone else's id).
 */

import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

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
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{title}</h2>
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">{children}</div>
      </div>
    </div>
  );
}

export function HealthLoadError({ noun, error }: { noun: string; error: unknown }) {
  return (
    <div className="space-y-4">
      <BackToHealth />
      <div className="bg-red-50/20 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Failed to load {noun}</h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : `${capitalize(noun)} not found`}
            </p>
          </div>
        </div>
      </div>
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
