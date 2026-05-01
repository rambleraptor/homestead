'use client';

/**
 * Todometer-style date header — big day number on the left with month + year
 * stacked next to it, day-of-week on the right. Pure presentation; the date
 * is "today" at render time.
 */

interface TodoHeaderProps {
  now?: Date;
}

export function TodoHeader({ now = new Date() }: TodoHeaderProps) {
  const day = now.getDate();
  const month = now.toLocaleDateString('en-US', { month: 'short' });
  const year = now.getFullYear();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <div
      className="flex items-end justify-between"
      data-testid="todos-header"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-6xl font-display font-bold text-brand-navy leading-none">
          {day}
        </span>
        <div className="flex flex-col text-text-muted font-body leading-tight">
          <span className="text-base font-semibold text-brand-navy">
            {month}
          </span>
          <span className="text-sm">{year}</span>
        </div>
      </div>
      <span className="text-2xl font-display text-text-muted">{weekday}</span>
    </div>
  );
}
