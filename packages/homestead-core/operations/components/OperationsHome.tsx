/**
 * Operations app home — lists AEP-151 long-running operations, polling while
 * any are still in flight. Superuser-only (gated by the app's route).
 */

import { CheckCircle2, ListChecks, XCircle } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import type { OperationLogEntry } from '@rambleraptor/homestead-core/resources/operations';
import { useOperations } from '../hooks/useOperations';
import type { Operation } from '../types';

function formatDate(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
}

function formatTime(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', second: 'numeric' });
}

/**
 * Read the operation's log timeline from `metadata.logs`, tolerating the
 * loosely-typed `metadata` (an arbitrary object on the wire).
 */
function readLogs(operation: Operation): OperationLogEntry[] {
  const logs = (operation.metadata as { logs?: unknown } | undefined)?.logs;
  if (!Array.isArray(logs)) return [];
  return logs.filter(
    (e): e is OperationLogEntry =>
      !!e && typeof (e as OperationLogEntry).message === 'string',
  );
}

function OperationStatusIcon({ operation }: { operation: Operation }) {
  if (!operation.done) return <Spinner size="sm" />;
  if (operation.status === 'failed' || operation.error) {
    return <XCircle className="w-5 h-5 text-red-500" />;
  }
  return <CheckCircle2 className="w-5 h-5 text-green-500" />;
}

function statusLabel(operation: Operation): string {
  // The canonical status word. The live per-step detail lives in the log
  // timeline below (its last entry is the operation's current status).
  if (!operation.done) {
    // Queued behind the concurrency gate: waiting for a slot, not yet running.
    return operation.status === 'pending' ? 'Queued…' : 'Running…';
  }
  if (operation.status === 'failed' || operation.error) return 'Failed';
  return 'Completed';
}

function OperationRow({ operation }: { operation: Operation }) {
  const errorMessage =
    typeof operation.error?.detail === 'string' ? operation.error.detail : null;
  const logs = readLogs(operation);

  return (
    <Card>
      <div
        className="flex items-start gap-3"
        data-testid={`operation-${operation.id}`}
      >
        <div className="mt-0.5">
          <OperationStatusIcon operation={operation} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-brand-navy">
            {operation.title || operation.method || 'Operation'}
          </h3>
          <p className="text-sm text-text-muted mt-1" data-testid="operation-status">
            {statusLabel(operation)}
            {operation.method ? ` · ${operation.method}` : ''}
          </p>
          {errorMessage && (
            <p className="text-sm text-red-600 mt-1 break-words">{errorMessage}</p>
          )}
          {logs.length > 0 && (
            <ul
              className="mt-2 space-y-0.5 border-l-2 border-gray-100 pl-3"
              data-testid="operation-logs"
            >
              {logs.map((entry, i) => (
                <li key={i} className="text-xs text-text-muted flex gap-2">
                  <span className="tabular-nums shrink-0 text-gray-400">
                    {formatTime(entry.time)}
                  </span>
                  <span className="break-words">{entry.message}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-text-muted mt-2">
            {formatDate(operation.updated || operation.created)}
          </p>
        </div>
      </div>
    </Card>
  );
}

function OperationsList() {
  const { data: operations, isLoading, isError, error, refetch } = useOperations();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <QueryError
        error={error}
        onRetry={() => void refetch()}
        title="Couldn’t load operations"
        data-testid="operations-error"
      />
    );
  }

  if (!operations || operations.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No operations yet"
        description="Long-running tasks will appear here while they run."
        data-testid="operations-empty"
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="operations-list">
      {operations.map((operation) => (
        <OperationRow key={operation.id} operation={operation} />
      ))}
    </div>
  );
}

export function OperationsHome() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        subtitle="Long-running background tasks across the household."
      />
      <OperationsList />
    </div>
  );
}
