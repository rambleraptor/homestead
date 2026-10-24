import { Link } from 'react-router-dom';
import { Cake, CalendarHeart, Edit, Heart, Star, Trash2, Users } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { useFavorites } from '@rambleraptor/homestead-core/shared/favorites';
import {
  getNextEventOccurrence,
  parseDateString,
} from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { useEventsForPerson } from '../../events/hooks/useEventsForPerson';
import type { Event } from '../../events/types';
import { HouseholdSummary } from './HouseholdSummary';
import type { Person } from '../types';

interface PersonCardProps {
  person: Person;
  onEdit: (person: Person) => void;
  onDelete: (person: Person) => void;
}

function EventIcon({ tag }: { tag?: string }) {
  if (tag === 'birthday') {
    return <Cake className="w-5 h-5 text-pink-500" aria-label="Cake icon" />;
  }
  if (tag === 'anniversary') {
    return <Heart className="w-5 h-5 text-red-500" aria-label="Heart icon" />;
  }
  return (
    <CalendarHeart
      className="w-5 h-5 text-brand-navy"
      aria-label="Event icon"
    />
  );
}

function formatEventDate(event: Event): string {
  if (!event.date?.trim()) return '';
  const next = getNextEventOccurrence(
    parseDateString(event.date),
    event.recurrence,
    event.recurrence_rule,
  );
  return next.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

export function PersonCard({
  person,
  onEdit,
  onDelete,
}: PersonCardProps) {
  const partner = person.partner;
  const events = useEventsForPerson(person.id);
  const favorites = useFavorites('person');
  const starred = favorites.isFavorite(person.id);

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">
                <Link
                  to={`/people/${person.id}`}
                  className="hover:text-blue-600 hover:underline"
                  data-testid="person-detail-link"
                >
                  {person.name}
                </Link>
              </h3>
              {partner && (
                <div
                  className="flex items-center gap-1 text-xs text-gray-500"
                  data-testid={`person-partner-${person.id}`}
                >
                  <Users className="w-3 h-3" aria-label="Partner icon" />
                  <span>{partner.name}</span>
                </div>
              )}
            </div>
            {person.aliases.length > 0 && (
              <p className="text-xs text-gray-500 mt-0.5" data-testid="person-aliases-list">
                aka {person.aliases.join(', ')}
              </p>
            )}
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-2 mt-1"
                data-testid={`person-event-${event.id}`}
              >
                <EventIcon tag={event.tag} />
                <p className="text-sm text-gray-500">
                  {formatEventDate(event)}
                  {!event.tag && event.name ? ` — ${event.name}` : ''}
                </p>
              </div>
            ))}
            {person.households.length > 0 && (
              <div className="mt-1 space-y-2" data-testid={`person-card-households-${person.id}`}>
                {person.households.map((household) => (
                  <HouseholdSummary key={household.id} household={household} showName />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => favorites.toggle(person.id)}
            aria-pressed={starred}
            aria-label={`${starred ? 'Unstar' : 'Star'} ${person.name}`}
            data-testid={`person-star-${person.id}`}
          >
            <Star
              className={`w-4 h-4 ${starred ? 'fill-amber-400 text-amber-400' : ''}`}
            />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(person)}
            aria-label={`Edit ${person.name}`}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDelete(person)}
            aria-label={`Delete ${person.name}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
