'use client';

import { CalendarHeart, Edit, Trash2, Users } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import {
  getNextOccurrence,
  parseDateString,
} from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { usePeople } from '../../people/hooks/usePeople';
import type { Event } from '../types';

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

function formatNextOccurrence(date: string): string {
  if (!date.trim()) return '';
  const next = getNextOccurrence(parseDateString(date));
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
              {formatNextOccurrence(event.date)}
            </p>
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
