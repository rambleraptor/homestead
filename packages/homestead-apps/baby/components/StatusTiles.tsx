import { Baby as BabyIcon, Droplets, Moon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { describeEvent, formatAgo, formatDuration, startedAt, timeLabel } from '../baby';
import type { BabyLog } from '../hooks/useBabyLog';

interface TileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  /** A quiet word after the value: "ago". */
  suffix?: string;
  detail?: string;
  testId: string;
}

function Tile({ icon: Icon, label, value, suffix, detail, testId }: TileProps) {
  return (
    <div
      className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-surface-white p-3"
      data-testid={testId}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-bold text-brand-navy">
        <span className="whitespace-nowrap">{value}</span>
        {suffix && <span className="font-body text-xs font-normal text-text-muted"> {suffix}</span>}
      </div>
      {detail && <div className="line-clamp-2 text-xs text-text-muted">{detail}</div>}
    </div>
  );
}

const since = (iso: string, now: number) => formatDuration(now - new Date(iso).getTime());

/** `formatAgo` split so "ago" can sit small beside the number. */
function ago(iso: string, now: number): { value: string; suffix?: string } {
  const text = formatAgo(iso, now);
  return text.endsWith(' ago') ? { value: text.slice(0, -4), suffix: 'ago' } : { value: text };
}

/** Where things stand right now: last feed, last diaper, asleep or awake. */
export function StatusTiles({ log }: { log: BabyLog }) {
  const { status, now } = log;
  const { lastFeed, lastDiaper, nursing, sleeping, awakeSince } = status;

  return (
    <div className="flex gap-2" data-testid="baby-status">
      {nursing ? (
        <Tile
          icon={BabyIcon}
          label="Feeding"
          value={since(startedAt(nursing), now)}
          detail={`${describeEvent(nursing).replace('Nursed', 'Nursing')} · since ${timeLabel(startedAt(nursing))}`}
          testId="baby-status-feed"
        />
      ) : (
        <Tile
          icon={BabyIcon}
          label="Feed"
          {...(lastFeed ? ago(startedAt(lastFeed), now) : { value: '—' })}
          detail={lastFeed ? `${describeEvent(lastFeed)} · ${timeLabel(startedAt(lastFeed))}` : 'No feeds yet'}
          testId="baby-status-feed"
        />
      )}
      <Tile
        icon={Droplets}
        label="Diaper"
        {...(lastDiaper ? ago(startedAt(lastDiaper), now) : { value: '—' })}
        detail={
          lastDiaper ? `${describeEvent(lastDiaper)} · ${timeLabel(startedAt(lastDiaper))}` : 'No diapers yet'
        }
        testId="baby-status-diaper"
      />
      {sleeping ? (
        <Tile
          icon={Moon}
          label="Asleep"
          value={since(startedAt(sleeping), now)}
          detail={`Since ${timeLabel(startedAt(sleeping))}`}
          testId="baby-status-sleep"
        />
      ) : (
        <Tile
          icon={Moon}
          label="Awake"
          value={awakeSince ? since(awakeSince, now) : '—'}
          detail={awakeSince ? `Since ${timeLabel(awakeSince)}` : 'No sleep logged yet'}
          testId="baby-status-sleep"
        />
      )}
    </div>
  );
}
