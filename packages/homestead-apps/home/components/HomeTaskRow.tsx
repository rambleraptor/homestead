/**
 * One upkeep task in the list: what it is, when it's next due, how often it
 * comes round, and the notes you'll want when you get to it.
 *
 * The notes render inline rather than behind a disclosure — "20x25x1, MERV 11"
 * is the reason the reminder exists, and a row that hides it makes you open an
 * edit form to answer the question the reminder just asked.
 */

import { Check, Pencil, Play, Trash2, Pause } from 'lucide-react';
import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import type { HomeTask } from '../types';
import { dueLabel, intervalLabel, urgencyOf, type HomeTaskUrgency } from '../utils/homeTasks';
import { parseIsoDate } from '../utils/pickups';

/** Badge tone per urgency. `scheduled` gets no badge at all — the date says it. */
const BADGE_VARIANT: Record<
  Exclude<HomeTaskUrgency, 'scheduled'>,
  'danger' | 'warning' | 'neutral'
> = {
  overdue: 'danger',
  'due-today': 'warning',
  'due-soon': 'warning',
  paused: 'neutral',
};

interface HomeTaskRowProps {
  task: HomeTask;
  onComplete: (task: HomeTask) => void;
  onEdit: (task: HomeTask) => void;
  onTogglePause: (task: HomeTask) => void;
  onDelete: (task: HomeTask) => void;
  busy?: boolean;
}

export function HomeTaskRow({
  task,
  onComplete,
  onEdit,
  onTogglePause,
  onDelete,
  busy = false,
}: HomeTaskRowProps) {
  const urgency = urgencyOf(task);
  const lastDone = parseIsoDate(task.last_completed ?? '');

  return (
    <li
      className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
      data-testid="home-task-row"
      data-task-name={task.name}
    >
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-body font-medium text-text-main">
          <span className={task.paused ? 'text-text-muted' : undefined}>{task.name}</span>
          {urgency !== 'scheduled' && (
            <Badge variant={BADGE_VARIANT[urgency]} data-testid="home-task-urgency">
              {urgency === 'paused' ? 'Paused' : dueLabel(task)}
            </Badge>
          )}
        </p>
        <p className="font-body text-sm text-text-muted" data-testid="home-task-schedule">
          {intervalLabel(task.interval_count, task.interval_unit)}
          {urgency === 'paused' || urgency === 'scheduled' ? ` · ${dueLabel(task)}` : ''}
          {lastDone
            ? ` · Last done ${lastDone.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}`
            : ''}
        </p>
        {task.notes && (
          <p
            className="whitespace-pre-line font-body text-sm text-text-muted"
            data-testid="home-task-notes"
          >
            {task.notes}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onComplete(task)}
          disabled={busy}
          title="Mark done and roll the schedule forward"
          data-testid="home-task-done"
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Done
        </button>
        <button
          type="button"
          onClick={() => onTogglePause(task)}
          disabled={busy}
          title={task.paused ? 'Resume reminders' : 'Keep the schedule but stop reminding'}
          aria-label={task.paused ? `Resume ${task.name}` : `Pause ${task.name}`}
          data-testid="home-task-pause"
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-text-muted disabled:opacity-50"
        >
          {task.paused ? (
            <Play className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Pause className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onEdit(task)}
          aria-label={`Edit ${task.name}`}
          data-testid="home-task-edit"
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-text-muted"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(task)}
          aria-label={`Delete ${task.name}`}
          data-testid="home-task-delete"
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
