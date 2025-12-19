import { Cake, Heart, Edit, Trash2 } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import type { Event } from '../types';

interface EventCardProps {
  event: Event;
  onEdit: (event: Event) => void;
  onDelete: (event: Event) => void;
}

export function EventCard({
  event,
  onEdit,
  onDelete,
}: EventCardProps) {
  const formatDate = (dateString: string) => {
    // Extract just the date portion (YYYY-MM-DD) from PocketBase format (YYYY-MM-DD HH:MM:SS.sssZ)
    const datePortion = dateString.substring(0, 10);
    // Parse the date string to avoid timezone issues
    const [year, month, day] = datePortion.split('-').map(Number);
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
              {event.people_involved}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {formatDate(event.event_date)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(event)}
            aria-label={`Edit ${event.people_involved}`}
          >
            <Edit className="w-4 h-4" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDelete(event)}
            aria-label={`Delete ${event.people_involved}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
