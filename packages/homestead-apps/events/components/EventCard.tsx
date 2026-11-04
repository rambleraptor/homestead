import { CalendarHeart, Edit, Trash2, Users } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import { parseNthWeekdayRule } from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { usePeople } from '../../people/hooks/usePeople';
import {
  eventAgeLabel,
  eventAnchorDate,
  hasEventDate,
  nextOccurrence,
} from '../utils/eventDate';
import { formatPeopleList, isPeopleCenteredTag, isToday, todayAgeLabel } from '../utils/upcoming';
import { EventReminderSelect } from './EventReminderSelect';
import { TodayBadge } from './TodayBadge';
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
  if (!hasEventDate(event)) return null;
  const parsed = parseNthWeekdayRule(event.recurrence_rule);
  if (!parsed) return null;
  const month = eventAnchorDate(event).toLocaleDateString('en-US', {
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
  if (!hasEventDate(event)) return '';
  return nextOccurrence(event).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

export function EventCard({ event, onEdit, onDelete }: EventCardProps) {
  const { data: people = [] } = usePeople();
  const peopleById = new Map(people.map((p) => [p.id, p.name]));
  const tagged = (event.people ?? [])
    .map((ref) => peopleById.get(personIdFromRef(ref)))
    .filter((n): n is string => !!n);
  const showPeopleAsTitle =
    isPeopleCenteredTag(event.tag) && tagged.length > 0;
  const stackPeopleLines = showPeopleAsTitle && event.tag === 'anniversary';
  const headerText = showPeopleAsTitle ? formatPeopleList(tagged) : event.name;
  const next = hasEventDate(event) ? nextOccurrence(event) : null;
  const occurrenceYear = next ? next.getFullYear() : null;
  const ageLabel =
    occurrenceYear != null ? eventAgeLabel(event, occurrenceYear) : null;
  // The day itself: the badge takes the place of the age line, carrying it.
  const today = next !== null && isToday(next);

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
            <div
              className={`flex gap-2 flex-wrap ${stackPeopleLines ? 'items-start' : 'items-center'}`}
            >
              {stackPeopleLines ? (
                <h3 className="font-semibold text-gray-900 min-w-0">
                  {tagged.map((name) => (
                    <span key={name} className="block truncate">
                      {name}
                    </span>
                  ))}
                </h3>
              ) : (
                <h3 className="font-semibold text-gray-900 truncate">
                  {headerText}
                </h3>
              )}
              {event.tag && (
                <Badge variant={badgeVariantForTag(event.tag)}>
                  {event.tag}
                </Badge>
              )}
              {today && next && (
                <TodayBadge
                  tag={event.tag}
                  ageLabel={todayAgeLabel(event, next)}
                  data-testid={`event-card-today-${event.id}`}
                />
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {formatNextOccurrence(event)}
              {ageLabel && !today && (
                <span
                  className="ml-2 text-gray-400"
                  data-testid={`event-card-age-${event.id}`}
                >
                  · {ageLabel}
                </span>
              )}
            </p>
            {formatRecurrenceRule(event) && (
              <p className="text-xs text-gray-500 mt-0.5">
                {formatRecurrenceRule(event)}
              </p>
            )}
            {!showPeopleAsTitle && tagged.length > 0 && (
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
      <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end">
        <EventReminderSelect eventId={event.id} />
      </div>
    </Card>
  );
}
