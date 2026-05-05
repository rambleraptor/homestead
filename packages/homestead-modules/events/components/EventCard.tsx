'use client';

import { CalendarHeart, Edit, Trash2, Users } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import {
  getNextEventOccurrence,
  parseDateString,
  parseNthWeekdayRule,
} from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { usePeople } from '../../people/hooks/usePeople';
import type { Event } from '../types';

const ORDINAL_BY_N: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
  [-1]: 'Last',
};

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function formatRecurrenceRule(event: Event): string | null {
  if (event.recurrence !== 'yearly-nth-weekday') return null;
  const parsed = parseNthWeekdayRule(event.recurrence_rule);
  if (!parsed) return null;
  const month = parseDateString(event.date).toLocaleDateString('en-US', {
    month: 'long',
  });
  const ord = ORDINAL_BY_N[parsed.n] ?? `${parsed.n}th`;
  return `${ord} ${WEEKDAY_NAMES[parsed.weekday]} of ${month}`;
}

interface EventCardProps {
  event: Event;
  onEdit: (event: Event) => void;
  onDelete: (event: Event) => void;
}

function personIdFromRef(ref: string): string {
  return ref.startsWith('people/') ? ref.slice('people/'.length) : ref;
}

function badgeVariantForTag(
  tag?: string,
): 'birthday' | 'anniversary' | 'neutral' {
  if (tag === 'birthday') return 'birthday';
  if (tag === 'anniversary') return 'anniversary';
  return 'neutral';
}

function formatNextOccurrence(event: Event): string {
  if (!event.date.trim()) return '';
  const next = getNextEventOccurrence(
    parseDateString(event.date),
    event.recurrence,
    event.recurrence_rule,
  );
  return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export function EventCard({ event, onEdit, onDelete }: EventCardProps) {
  const { data: people = [] } = usePeople();
  const peopleById = new Map(people.map((p) => [p.id, p.name]));
  const tagged = (event.people ?? [])
    .map((ref) => peopleById.get(personIdFromRef(ref)))
    .filter((n): n is string => !!n);

  return (
    <Card>
      <div
        className="flex items-start justify-between gap-3"
        data-testid={`event-card-${event.id}`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="bg-gray-50 rounded-lg p-2" aria-hidden="true">
            <CalendarHeart className="w-5 h-5 text-brand-navy" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 truncate">
                {event.name}
              </h3>
              {event.tag && (
                <Badge variant={badgeVariantForTag(event.tag)}>
                  {event.tag}
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {formatNextOccurrence(event)}
            </p>
            {formatRecurrenceRule(event) && (
              <p className="text-xs text-gray-500 mt-0.5">
                {formatRecurrenceRule(event)}
              </p>
            )}
            {tagged.length > 0 && (
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                <Users className="w-4 h-4" aria-hidden="true" />
                {tagged.join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label={`Edit ${event.name}`}
            onClick={() => onEdit(event)}
            data-testid={`event-card-edit-${event.id}`}
            className="p-2 rounded-md text-gray-500 hover:text-brand-navy hover:bg-gray-100"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${event.name}`}
            onClick={() => onDelete(event)}
            data-testid={`event-card-delete-${event.id}`}
            className="p-2 rounded-md text-gray-500 hover:text-red-600 hover:bg-gray-100"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}
