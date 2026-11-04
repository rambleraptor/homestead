/**
 * The inline error a read renders where its data would have been.
 *
 * A failed `useQuery` must never collapse into an empty list — that reads as
 * "nothing here" when the truth is "couldn't look". This says what failed, in
 * the server's own words via `getAepErrorMessage` (the one error → message
 * mapping, shared with the toasts), and offers to try again when the caller
 * hands it the query's `refetch`.
 *
 * `role="alert"` so a screen reader announces the failure the moment it lands.
 * `compact` is for a card's corner or a widget: smaller type, tighter box.
 */

import { AlertCircle, RotateCw } from 'lucide-react';
import { getAepErrorMessage } from '@rambleraptor/homestead-core/api/errorMessage';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { Button } from './Button';

export interface QueryErrorProps {
  error: unknown;
  /** Usually the query's `refetch`; the Retry button appears only when given. */
  onRetry?: () => void;
  title?: string;
  compact?: boolean;
  className?: string;
  'data-testid'?: string;
}

export function QueryError({
  error,
  onRetry,
  title = 'Couldn’t load this',
  compact = false,
  className,
  'data-testid': testId = 'query-error',
}: QueryErrorProps) {
  const message = getAepErrorMessage(error);

  return (
    <div
      role="alert"
      data-testid={testId}
      className={cn(
        'flex flex-wrap items-start gap-3 border border-red-200 bg-red-50 text-red-800',
        compact ? 'rounded-xl px-3 py-2 text-xs' : 'rounded-2xl p-4 text-sm',
        className,
      )}
    >
      <AlertCircle
        className={cn('mt-0.5 shrink-0 text-red-600', compact ? 'h-4 w-4' : 'h-5 w-5')}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-semibold">{title}</p>
        <p className={cn('text-red-700', compact ? 'mt-0.5' : 'mt-1')}>{message}</p>
      </div>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          className="ml-auto shrink-0"
          data-testid={`${testId}-retry`}
        >
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  );
}
