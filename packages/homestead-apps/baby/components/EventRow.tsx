import { describeEvent, eventDuration, formatDuration, startedAt, timeLabel } from '../baby';
import type { BabyEvent } from '../types';

interface EventRowProps {
  event: BabyEvent;
  now: number;
  /** Who logged it, when it wasn't the person looking. */
  loggedBy?: string;
  onOpen: (event: BabyEvent) => void;
}

/** One entry on the timeline; tap to edit it. */
export function EventRow({ event, now, loggedBy, onOpen }: EventRowProps) {
  const duration = eventDuration(event, now);
  const ongoing = event.kind === 'sleep' && !event.ended_at;
  const detail = [
    duration !== undefined ? formatDuration(duration) : undefined,
    ongoing ? 'still asleep' : undefined,
    loggedBy,
  ].filter(Boolean);

  return (
    <li>
      <button
        type="button"
        data-testid="baby-event-row"
        data-kind={event.kind}
        onClick={() => onOpen(event)}
        className="flex w-full items-baseline gap-3 rounded-lg px-2 py-2 text-left hover:bg-bg-pearl"
      >
        <time className="w-16 shrink-0 text-right text-xs tabular-nums text-text-muted">
          {timeLabel(startedAt(event))}
        </time>
        <span className="min-w-0 flex-1">
          <span className="font-body text-sm text-text-main">{describeEvent(event)}</span>
          {detail.length > 0 && (
            <span className="ml-2 text-xs text-text-muted">{detail.join(' · ')}</span>
          )}
          {event.notes && <span className="block truncate text-xs text-text-muted">{event.notes}</span>}
        </span>
      </button>
    </li>
  );
}
