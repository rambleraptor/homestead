import { Cake, Heart, Edit, Trash2 } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import type { Event } from '../types';

interface EventCardProps {
  event: Event;
  onEdit: (event: Event) => void;
  onDelete: (event: Event) => void;
  showDetails?: boolean;
}

export function EventCard({
  event,
  onEdit,
  onDelete,
  showDetails = true,
}: EventCardProps) {
  const formatDate = (dateString: string) => {
    // Parse the date string to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {event.event_type === 'birthday' ? (
            <Cake className="w-6 h-6 text-pink-500 mt-1" />
          ) : (
            <Heart className="w-6 h-6 text-red-500 mt-1" />
          )}
          <div>
            <h3 className="font-semibold text-gray-900">
              {event.title}
            </h3>
            <p className="text-sm text-gray-600">
              {event.people_involved}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {formatDate(event.event_date)}
              {event.recurring_yearly && ' (Recurring)'}
            </p>
            {showDetails && event.details && (
              <p className="text-sm text-gray-600 mt-2">
                {event.details}
              </p>
            )}
            {showDetails && event.notification_preferences?.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Reminders:{' '}
                {event.notification_preferences
                  .map((p) => p.replaceAll('_', ' '))
                  .join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(event)}
            aria-label={`Edit ${event.title}`}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDelete(event)}
            aria-label={`Delete ${event.title}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
