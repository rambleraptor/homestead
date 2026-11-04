/**
 * The Scheduled tab — what is queued to reach you, and when.
 *
 * Two kinds of row share this list and the difference is worth being honest
 * about in the UI rather than in a doc comment. A notification you scheduled is
 * yours: edit it, cancel it, it does what you said. A notification an *app*
 * scheduled (an event a week out, tomorrow's bin night, a perk window closing)
 * is derived — its content is recomputed from the source record on every
 * reconcile, so an edit here would be silently reverted on the next cron run.
 *
 * So app rows get **cancel but not edit**, and their badge links to the setting
 * that actually controls them. Cancelling one sticks (it's a status, not a
 * delete, so the reconcile that would otherwise recreate it sees the row and
 * leaves it alone), but the honest way to stop hearing about bin night forever
 * is the opt-in on the Home app, and the badge is how you get there.
 *
 * Rows are grouped by day rather than folded away by kind. The list is bounded
 * by time — a queue only ever holds what is coming — so the volume problem that
 * forced the old Reminders tab to hide app rows behind a count doesn't arise.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, Ban, CalendarClock, Edit, Plus } from 'lucide-react';
import { getAppById } from '@rambleraptor/homestead-core/apps/registry';
import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { SectionCard } from '@rambleraptor/homestead-core/shared/components/SectionCard';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useScheduledNotifications } from '../hooks/useScheduledNotifications';
import {
  useCancelScheduledNotification,
  useScheduleNotification,
  useUpdateScheduledNotification,
} from '../hooks/useScheduleNotification';
import { dayKey, dayLabel, formatTime, isOverdue } from '../utils/scheduleDate';
import { ScheduleForm } from './ScheduleForm';
import type {
  ScheduledNotification,
  ScheduledNotificationFormData,
} from '../types';

/**
 * Display name of the app that scheduled a row, and where its badge links.
 * Falls back to the stored id: an app can be uninstalled from an instance while
 * the rows it wrote are still queued, and "home" beats a blank badge.
 */
function appInfo(appId: string): { label: string; path?: string } {
  try {
    const app = getAppById(appId);
    if (app) return { label: app.name, path: app.web?.basePath };
  } catch {
    // The registry throws when it hasn't been installed. A missing label is
    // not worth failing a render over.
  }
  return { label: appId };
}

/** Rows that have already had their say, newest first. */
function isSettled(row: ScheduledNotification): boolean {
  return row.status !== 'scheduled';
}

/**
 * A row that should have reached you and didn't.
 *
 * `missed` means the instance was down past the grace window when it came due;
 * `failed` means delivery kept erroring until the attempt budget ran out. The
 * dispatcher marks both precisely so they aren't silent — which only works if
 * something says so. `sent` and `canceled` are settled *and* fine, so they stay
 * folded away.
 */
function isUndelivered(row: ScheduledNotification): boolean {
  return row.status === 'missed' || row.status === 'failed';
}

/** Plain-language reason, for the alert and each row's line. */
function undeliveredReason(row: ScheduledNotification): string {
  return row.status === 'missed'
    ? 'Not sent — this instance was offline when it came due.'
    : 'Delivery failed. It is saved here but was never pushed.';
}

/** How many undelivered rows the alert names before summarising the rest. */
const MAX_UNDELIVERED_SHOWN = 3;

export function ScheduledSection() {
  const { data: rows, isLoading } = useScheduledNotifications();
  const schedule = useScheduleNotification();
  const update = useUpdateScheduledNotification();
  const cancel = useCancelScheduledNotification();
  const toast = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledNotification | null>(null);
  const [confirm, setConfirm] = useState<ScheduledNotification | null>(null);
  const [showSettled, setShowSettled] = useState(false);

  const { queued, settled, undelivered } = useMemo(() => {
    const all = rows ?? [];
    const newestFirst = (a: ScheduledNotification, b: ScheduledNotification) =>
      (b.send_at || '').localeCompare(a.send_at || '');
    return {
      queued: all.filter((row) => !isSettled(row)),
      settled: all.filter(isSettled).sort(newestFirst),
      undelivered: all.filter(isUndelivered).sort(newestFirst),
    };
  }, [rows]);

  /** Queued rows bucketed by local calendar day, in send order. */
  const days = useMemo(() => {
    const byDay = new Map<string, ScheduledNotification[]>();
    for (const row of queued) {
      const key = dayKey(row.send_at);
      const list = byDay.get(key);
      if (list) list.push(row);
      else byDay.set(key, [row]);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [queued]);

  const handleCreate = async (data: ScheduledNotificationFormData) => {
    try {
      await schedule.mutateAsync(data);
      setIsCreateOpen(false);
      toast.success('Scheduled');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleUpdate = async (data: ScheduledNotificationFormData) => {
    if (!editing) return;
    try {
      await update.mutateAsync({ id: editing.id, data });
      setEditing(null);
      toast.success('Updated');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleCancel = async () => {
    if (!confirm) return;
    try {
      await cancel.mutateAsync(confirm.id);
      setConfirm(null);
      toast.success('Cancelled');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <SectionCard
      icon={CalendarClock}
      title="Scheduled"
      action={
        <div className="flex items-center gap-2">
          {settled.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSettled((v) => !v)}
              data-testid="scheduled-toggle-settled"
              className="text-sm text-gray-500 hover:text-brand-navy"
            >
              {showSettled ? 'Hide past' : `Show past (${settled.length})`}
            </button>
          )}
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            data-testid="add-scheduled-button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Remind me
          </Button>
        </div>
      }
    >
      {undelivered.length > 0 && (
        <div
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          data-testid="scheduled-undelivered"
          role="status"
        >
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            {undelivered.length === 1
              ? "1 reminder didn't reach you"
              : `${undelivered.length} reminders didn't reach you`}
          </p>
          <ul className="mt-2 space-y-1">
            {undelivered.slice(0, MAX_UNDELIVERED_SHOWN).map((row) => (
              <li key={row.id} data-testid={`scheduled-undelivered-${row.id}`}>
                <span className="font-medium">{row.title}</span>
                {' — '}
                {dayLabel(row.send_at)}. {undeliveredReason(row)}
              </li>
            ))}
          </ul>
          {undelivered.length > MAX_UNDELIVERED_SHOWN && (
            <p className="mt-1">
              …and {undelivered.length - MAX_UNDELIVERED_SHOWN} more, under Past.
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : queued.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing scheduled"
          description="Add something you want to be told about later."
          data-testid="scheduled-empty"
        />
      ) : (
        <div className="space-y-5" data-testid="scheduled-list">
          {days.map(([key, dayRows]) => (
            <div key={key}>
              <h3 className="text-sm font-semibold text-gray-500 mb-2">
                {dayLabel(dayRows[0].send_at)}
              </h3>
              <ul className="space-y-2">
                {dayRows.map((row) => {
                  const app = row.source_app ? appInfo(row.source_app) : null;
                  const late = isOverdue(row.send_at);
                  return (
                    <li
                      key={row.id}
                      data-testid={`scheduled-row-${row.id}`}
                      className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 p-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          data-testid={`scheduled-time-${row.id}`}
                          className={`shrink-0 tabular-nums text-sm mt-0.5 ${
                            late ? 'text-amber-600' : 'text-gray-500'
                          }`}
                        >
                          {formatTime(row.send_at)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">
                            {row.title}
                            {app && (
                              <span
                                className="ml-2 align-middle"
                                data-testid={`scheduled-app-${row.id}`}
                              >
                                {app.path ? (
                                  <a href={app.path} title={`Manage in ${app.label}`}>
                                    <Badge variant="neutral">{app.label}</Badge>
                                  </a>
                                ) : (
                                  <Badge variant="neutral">{app.label}</Badge>
                                )}
                              </span>
                            )}
                          </p>
                          {row.message && row.message !== row.title && (
                            <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">
                              {row.message}
                            </p>
                          )}
                          {late && (
                            <p className="text-sm text-amber-600 mt-1">
                              Due — going out on the next check.
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {/* App rows are reconciled from their source record on
                            every run, so editing one here would be reverted. */}
                        {!app && (
                          <button
                            type="button"
                            aria-label={`Edit ${row.title}`}
                            onClick={() => setEditing(row)}
                            data-testid={`scheduled-edit-${row.id}`}
                            className="p-2 rounded-md text-gray-500 hover:text-brand-navy hover:bg-gray-100"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Cancel ${row.title}`}
                          onClick={() => setConfirm(row)}
                          data-testid={`scheduled-cancel-${row.id}`}
                          className="p-2 rounded-md text-gray-500 hover:text-red-600 hover:bg-gray-100"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {showSettled && settled.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-500 mb-2">Past</h3>
          <ul className="space-y-1" data-testid="scheduled-settled-list">
            {settled.map((row) => (
              <li
                key={row.id}
                data-testid={`scheduled-settled-${row.id}`}
                className="flex items-center justify-between gap-3 text-sm text-gray-500"
              >
                <span className="truncate">{row.title}</span>
                <span className="shrink-0 flex items-center gap-2">
                  <Badge variant={isUndelivered(row) ? 'warning' : 'neutral'}>
                    {row.status}
                  </Badge>
                  <span>{dayLabel(row.send_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Remind me"
      >
        <ScheduleForm
          onSubmit={handleCreate}
          onCancel={() => setIsCreateOpen(false)}
          isSubmitting={schedule.isPending}
        />
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit reminder">
        {editing && (
          <ScheduleForm
            initialData={editing}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
            isSubmitting={update.isPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={handleCancel}
        title="Cancel this notification"
        message={
          confirm
            ? confirm.source_app
              ? `"${confirm.title}" won't be sent. ${
                  appInfo(confirm.source_app).label
                } won't schedule this one again — to stop them for good, turn the reminder off in that app.`
              : `"${confirm.title}" won't be sent.`
            : ''
        }
        confirmLabel="Cancel it"
        variant="danger"
        isLoading={cancel.isPending}
      />
    </SectionCard>
  );
}
