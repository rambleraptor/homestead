/**
 * Eval cases — assistant replies people rated, each with the conversation that
 * led to it. A superuser reads the conversation, writes what the reply should
 * have done, and marks the case ready (it joins the eval suite) or retires it.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, FlaskConical, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { Textarea } from '@rambleraptor/homestead-core/shared/components/ui/textarea';
import { useHousehold } from '@rambleraptor/homestead-core/household/useHousehold';
import { referenceId } from '@rambleraptor/homestead-core/resources/references';
import type { TranscriptEntry } from '@rambleraptor/homestead-core/server/chat/eval-capture';
import { useDeleteEvalCase, useEvalCases, useUpdateEvalCase } from '../hooks/useEvalCases';
import { EVAL_CASE_STATUSES } from '../resources';
import type { EvalCase, EvalCaseStatus } from '../types';

type Filter = EvalCaseStatus | 'all';
const FILTERS: Filter[] = ['new', 'ready', 'retired', 'all'];
const FILTER_LABEL: Record<Filter, string> = { new: 'New', ready: 'Ready', retired: 'Retired', all: 'All' };
const STATUS_STYLE: Record<EvalCaseStatus, string> = {
  new: 'bg-amber-50 text-amber-700',
  ready: 'bg-green-50 text-green-700',
  retired: 'bg-gray-100 text-text-muted',
};

/** One tool call in a stored part, as `resource · action`. */
function toolLabel(part: Record<string, unknown>): string | null {
  if (typeof part.type !== 'string' || !part.type.startsWith('tool-')) return null;
  const input = part.input as { action?: unknown } | undefined;
  const action = typeof input?.action === 'string' ? ` · ${input.action}` : '';
  const failed = part.state === 'output-error' ? ' (failed)' : '';
  return `${part.type.slice('tool-'.length)}${action}${failed}`;
}

function Transcript({ entries, ratedId }: { entries: TranscriptEntry[]; ratedId?: string }) {
  return (
    <ol className="space-y-3 text-sm" data-testid="eval-case-transcript">
      {entries.map((entry) => {
        const tools = (entry.parts ?? [])
          .map((part) => toolLabel(part as Record<string, unknown>))
          .filter((label): label is string => label !== null);
        const rated = entry.id === ratedId;
        return (
          <li
            key={entry.id}
            className={rated ? 'rounded-md border-l-2 border-accent-terracotta pl-3' : 'pl-3'}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {entry.role === 'user' ? 'Person' : rated ? 'Assistant (rated)' : 'Assistant'}
            </p>
            {tools.length > 0 && (
              <ul className="mt-1 space-y-0.5 font-mono text-xs text-text-muted">
                {tools.map((label, i) => (
                  <li key={i}>→ {label}</li>
                ))}
              </ul>
            )}
            {entry.content && <p className="mt-1 whitespace-pre-wrap break-words text-text-main">{entry.content}</p>}
            {entry.error && <p className="mt-1 text-destructive">{entry.error}</p>}
          </li>
        );
      })}
    </ol>
  );
}

function EvalCaseCard({ evalCase, raterName }: { evalCase: EvalCase; raterName: string }) {
  const [open, setOpen] = useState(false);
  const [expected, setExpected] = useState(evalCase.expected ?? '');
  const [status, setStatus] = useState<EvalCaseStatus>(evalCase.status ?? 'new');
  const [deleting, setDeleting] = useState(false);
  const update = useUpdateEvalCase();
  const remove = useDeleteEvalCase();
  const ratedId = evalCase.message?.split('/').at(-1);
  const dirty = expected !== (evalCase.expected ?? '') || status !== (evalCase.status ?? 'new');
  const Rating = evalCase.rating === 'up' ? ThumbsUp : ThumbsDown;

  const save = async () => {
    try {
      await update.mutateAsync({ id: evalCase.id, data: { expected, status } });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };
  const handleDelete = async () => {
    try {
      await remove.mutateAsync(evalCase.id);
      setDeleting(false);
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <Card data-testid={`eval-case-${evalCase.id}`}>
      <div className="flex items-start gap-3">
        <Rating
          className={`mt-1 h-4 w-4 flex-shrink-0 ${evalCase.rating === 'up' ? 'text-green-600' : 'text-red-600'}`}
          aria-label={evalCase.rating === 'up' ? 'Rated up' : 'Rated down'}
          data-testid="eval-case-rating"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-brand-navy">{evalCase.title || 'Untitled conversation'}</h3>
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[evalCase.status ?? 'new']}`}>
              {FILTER_LABEL[evalCase.status ?? 'new']}
            </span>
            {evalCase.truncated && (
              <span
                className="rounded bg-gray-100 px-2 py-0.5 text-xs text-text-muted"
                title="A tool output was stored shortened, so a replay can’t return all of it."
              >
                Shortened output
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-muted">
            {raterName} · {new Date(evalCase.create_time).toLocaleString()}
          </p>
          {evalCase.note && (
            <blockquote className="mt-2 border-l-2 border-gray-200 pl-3 text-sm text-text-main" data-testid="eval-case-note">
              {evalCase.note}
            </blockquote>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-terracotta"
            aria-expanded={open}
            data-testid="eval-case-toggle"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {open ? 'Hide conversation' : 'Review'}
          </button>
          {open && (
            <div className="mt-3 space-y-4">
              <Transcript entries={evalCase.transcript ?? []} ratedId={ratedId} />
              <div>
                <label htmlFor={`expected-${evalCase.id}`} className="mb-1 block text-sm font-medium text-text-main">
                  What it should have done
                </label>
                <Textarea
                  id={`expected-${evalCase.id}`}
                  value={expected}
                  maxLength={4000}
                  onChange={(e) => setExpected(e.target.value)}
                  placeholder={
                    evalCase.rating === 'up'
                      ? 'Optional: what about this reply must stay true.'
                      : 'The right tool calls, the right answer, what it should have asked.'
                  }
                  data-testid="eval-case-expected"
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor={`status-${evalCase.id}`} className="mb-1 block text-sm font-medium text-text-main">
                    Status
                  </label>
                  <select
                    id={`status-${evalCase.id}`}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as EvalCaseStatus)}
                    className="block rounded-md border border-gray-300 bg-surface-white px-3 py-2 text-sm text-text-main focus:border-accent-terracotta focus:outline-none focus:ring-1 focus:ring-accent-terracotta"
                    data-testid="eval-case-status"
                  >
                    {EVAL_CASE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {FILTER_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <Button onClick={() => void save()} disabled={!dirty || update.isPending} data-testid="eval-case-save">
                  Save
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setDeleting(true)}
                  aria-label="Delete case"
                  data-testid="eval-case-delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        isOpen={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={handleDelete}
        title="Delete eval case"
        message="Delete this case and its copy of the conversation? The reply keeps its rating."
        confirmLabel="Delete"
        variant="danger"
        isLoading={remove.isPending}
      />
    </Card>
  );
}

export function EvalCasesHome() {
  const [filter, setFilter] = useState<Filter>('new');
  const { data: cases, isLoading, isError, error, refetch } = useEvalCases();
  const { data: household } = useHousehold();
  const nameOf = (ratedBy?: string) => {
    if (!ratedBy) return 'Someone';
    const id = referenceId(ratedBy, 'users');
    return household?.find((member) => member.id === id)?.name ?? 'Someone';
  };

  if (isLoading) {
    return <SkeletonPage body="list" label="Loading eval cases" data-testid="eval-cases-loading" />;
  }
  const shown = (cases ?? []).filter((c) => filter === 'all' || (c.status ?? 'new') === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Eval cases"
        subtitle="Assistant replies people rated with 👍 or 👎, with the conversation that led to each. Say what each should have done and mark it ready to test the assistant against."
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show cases">
        {FILTERS.map((f) => {
          const count = (cases ?? []).filter((c) => f === 'all' || (c.status ?? 'new') === f).length;
          return (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'primary' : 'secondary'}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              data-testid={`eval-cases-filter-${f}`}
            >
              {FILTER_LABEL[f]} ({count})
            </Button>
          );
        })}
      </div>
      {isError ? (
        <QueryError
          error={error}
          onRetry={() => void refetch()}
          title="Couldn’t load eval cases"
          data-testid="eval-cases-error"
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title={filter === 'new' ? 'Nothing to review' : 'No cases here'}
          description="Rate an assistant reply with 👍 or 👎 and it lands here to review."
          data-testid="eval-cases-empty"
        />
      ) : (
        <ul className="space-y-3" data-testid="eval-cases-list">
          {shown.map((evalCase) => (
            <li key={evalCase.id}>
              <EvalCaseCard evalCase={evalCase} raterName={nameOf(evalCase.rated_by)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
