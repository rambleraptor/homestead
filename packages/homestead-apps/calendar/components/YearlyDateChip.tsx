/**
 * A birthday or anniversary from the Events app, shown on its day. A link
 * rather than a button: the date lives in Events, so that is where it opens.
 */

import { Link } from 'react-router-dom';
import { Cake, Heart, Star } from 'lucide-react';
import type { YearlyDate } from '../utils/yearly';

function iconFor(tag: string | undefined) {
  if (tag === 'birthday') return Cake;
  if (tag === 'anniversary') return Heart;
  return Star;
}

export function YearlyDateChip({ date, compact = false }: { date: YearlyDate; compact?: boolean }) {
  const Icon = iconFor(date.tag);
  return (
    <Link
      to="/events"
      title={date.title}
      className={`flex w-full items-center gap-1 truncate rounded bg-rose-50 text-rose-900 hover:bg-rose-100 ${
        compact ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1.5 text-sm'
      }`}
      data-testid="calendar-yearly-date"
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate font-medium">{date.title}</span>
    </Link>
  );
}
