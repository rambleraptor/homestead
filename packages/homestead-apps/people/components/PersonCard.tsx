/**
 * One person in the People list: who they are at a glance, plus where they
 * live. The whole card opens the person's page; reference details that aren't
 * needed for recognition (WiFi, documents, family) live there.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Popover } from 'radix-ui';
import {
  Cake,
  CalendarHeart,
  Edit,
  Heart,
  Home,
  MapPin,
  MoreHorizontal,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { useFavorites } from '@rambleraptor/homestead-core/shared/favorites';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import type { MapProvider } from '@rambleraptor/homestead-core/auth/types';
import { useEventsForPerson } from '../../events/hooks/useEventsForPerson';
import { hasEventDate, nextOccurrence } from '../../events/utils/eventDate';
import type { Event } from '../../events/types';
import { formatAddress } from '../utils/households';
import { getMapUrl } from '../utils/mapUtils';
import type { Household, Person } from '../types';

interface PersonCardProps {
  person: Person;
  onEdit: (person: Person) => void;
  onDelete: (person: Person) => void;
}

const ICON = 'h-4 w-4 shrink-0 text-gray-400';
// Interactive children sit above the card-wide link.
const ABOVE_LINK = 'relative z-10';
const DAY_MS = 24 * 60 * 60 * 1000;

function EventIcon({ tag }: { tag?: string }) {
  if (tag === 'birthday') return <Cake className={ICON} aria-label="Cake icon" />;
  if (tag === 'anniversary') return <Heart className={ICON} aria-label="Heart icon" />;
  return <CalendarHeart className={ICON} aria-label="Event icon" />;
}

function eventLabel(event: Event): string {
  if (event.tag === 'birthday') return 'Birthday';
  if (event.tag === 'anniversary') return 'Anniversary';
  return event.name;
}

/** "today", "tomorrow" or "in N days" for an occurrence within two weeks. */
function soonLabel(next: Date): string | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((next.getTime() - today.getTime()) / DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1 && days <= 14) return `in ${days} days`;
  return null;
}

function PersonEvent({ event }: { event: Event }) {
  const next = nextOccurrence(event);
  const soon = soonLabel(next);
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={`person-event-${event.id}`}>
      <EventIcon tag={event.tag} />
      <span>
        {eventLabel(event)}{' '}
        {next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        {soon && <span className="text-brand-navy font-medium"> · {soon}</span>}
      </span>
    </span>
  );
}

function HouseholdLine({
  household,
  showName,
  mapProvider,
}: {
  household: Household;
  showName: boolean;
  mapProvider: MapProvider;
}) {
  const address = formatAddress(household);
  if (!address) {
    return (
      <li className="flex items-center gap-1.5">
        <Home className={ICON} aria-label="Household icon" />
        <span>{household.name}</span>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-1.5">
      <MapPin className={`${ICON} mt-0.5`} aria-label="Map pin icon" />
      <span className="min-w-0">
        <a
          href={getMapUrl(address, mapProvider)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${ABOVE_LINK} text-brand-navy hover:underline`}
        >
          {address}
        </a>
        {showName && <span className="text-gray-500"> · {household.name}</span>}
      </span>
    </li>
  );
}

export function PersonCard({ person, onEdit, onDelete }: PersonCardProps) {
  const { user } = useAuth();
  const events = useEventsForPerson(person.id).filter(hasEventDate);
  const favorites = useFavorites('person');
  const starred = favorites.isFavorite(person.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const { partner, households } = person;
  const mapProvider: MapProvider = user?.map_provider || 'google';

  const menuAction = (action: (p: Person) => void) => () => {
    setMenuOpen(false);
    action(person);
  };

  return (
    <Card className="relative transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">
            <Link
              to={`/people/${person.id}`}
              className="after:absolute after:inset-0 after:content-[''] hover:text-brand-navy"
              data-testid="person-detail-link"
            >
              {person.name}
            </Link>
          </h3>
          {person.aliases.length > 0 && (
            <p className="text-xs text-gray-500" data-testid="person-aliases-list">
              aka {person.aliases.join(', ')}
            </p>
          )}
        </div>

        <div className={`${ABOVE_LINK} -mr-2 -mt-1 flex shrink-0 items-center`}>
          <button
            type="button"
            onClick={() => favorites.toggle(person.id)}
            aria-pressed={starred}
            aria-label={`${starred ? 'Unstar' : 'Star'} ${person.name}`}
            data-testid={`person-star-${person.id}`}
            className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <Star className={`h-4 w-4 ${starred ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
          <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Popover.Trigger
              aria-label={`More actions for ${person.name}`}
              data-testid={`person-menu-${person.id}`}
              className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={4}
                role="menu"
                className="z-50 w-40 rounded-xl border border-gray-200 bg-white p-1 shadow-md"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={menuAction(onEdit)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Edit className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={menuAction(onDelete)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Delete
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>

      {(partner || events.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          {partner && (
            <span className="inline-flex items-center gap-1.5">
              <Users className={ICON} aria-label="Partner icon" />
              <span>
                Partner:{' '}
                <Link
                  to={`/people/${partner.id}`}
                  className={`${ABOVE_LINK} hover:underline`}
                  data-testid={`person-partner-${person.id}`}
                >
                  {partner.name}
                </Link>
              </span>
            </span>
          )}
          {events.map((event) => (
            <PersonEvent key={event.id} event={event} />
          ))}
        </div>
      )}

      {households.length > 0 && (
        <ul
          className="mt-2 space-y-1 text-sm"
          data-testid={`person-card-households-${person.id}`}
        >
          {households.map((household) => (
            <HouseholdLine
              key={household.id}
              household={household}
              showName={households.length > 1}
              mapProvider={mapProvider}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
