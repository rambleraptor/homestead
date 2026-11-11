import type { ReactNode } from 'react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import type { BabyLog } from '../hooks/useBabyLog';
import type { Side } from '../types';

interface LogButtonProps {
  testId: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}

function LogButton({ testId, onClick, active = false, children }: LogButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-14 flex-1 rounded-xl border px-2 py-2 text-sm font-semibold transition-colors',
        active
          ? 'border-accent-terracotta bg-accent-terracotta text-white'
          : 'border-gray-200 bg-surface-white text-brand-navy hover:bg-bg-pearl',
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

interface LogButtonsProps {
  log: BabyLog;
  /** A bottle needs an amount, so it opens a form instead of logging at once. */
  onBottle: () => void;
}

/** One tap logs it, at the time it was tapped. */
export function LogButtons({ log, onBottle }: LogButtonsProps) {
  const { status } = log;
  const nursingSide = status.nursing?.side;

  const side = (value: Side, label: string) => {
    const nursingHere = nursingSide === value;
    return (
      <LogButton
        testId={`baby-log-feed-${value}`}
        active={nursingHere}
        onClick={() => (nursingHere ? log.stopNursing() : log.startNursing(value))}
      >
        {nursingHere ? `Stop ${label.toLowerCase()}` : label}
        {!status.nursing && log.suggestedSide === value && (
          <span className="block text-xs font-normal text-text-muted">next</span>
        )}
      </LogButton>
    );
  };

  return (
    <div className="space-y-3" data-testid="baby-log-buttons">
      <Row label="Feed">
        {side('left', 'Left')}
        {side('right', 'Right')}
        <LogButton testId="baby-log-feed-bottle" onClick={onBottle}>
          Bottle
        </LogButton>
      </Row>
      <Row label="Diaper">
        <LogButton testId="baby-log-diaper-wet" onClick={() => log.logDiaper('wet')}>
          Wet
        </LogButton>
        <LogButton testId="baby-log-diaper-dirty" onClick={() => log.logDiaper('dirty')}>
          Dirty
        </LogButton>
        <LogButton testId="baby-log-diaper-both" onClick={() => log.logDiaper('both')}>
          Both
        </LogButton>
      </Row>
      <Row label="Sleep">
        <LogButton testId="baby-log-sleep" active={!!status.sleeping} onClick={log.toggleSleep}>
          {status.sleeping ? 'Woke up' : 'Fell asleep'}
        </LogButton>
      </Row>
    </div>
  );
}
