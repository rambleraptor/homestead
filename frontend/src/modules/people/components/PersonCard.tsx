import { Cake, Heart, Edit, Trash2, MapPin } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import type { Person } from '../types';

interface PersonCardProps {
  person: Person;
  onEdit: (person: Person) => void;
  onDelete: (person: Person) => void;
}

export function PersonCard({
  person,
  onEdit,
  onDelete,
}: PersonCardProps) {
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

  const googleMapsUrl = person.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        person.address
      )}`
    : '';

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">{person.name}</h3>
            {person.birthday && (
              <div className="flex items-center gap-2 mt-1">
                <Cake className="w-5 h-5 text-pink-500" aria-label="Cake icon" />
                <p className="text-sm text-gray-500">
                  {formatDate(person.birthday)}
                </p>
              </div>
            )}
            {person.anniversary && (
              <div className="flex items-center gap-2 mt-1">
                <Heart className="w-5 h-5 text-red-500" aria-label="Heart icon" />
                <p className="text-sm text-gray-500">
                  {formatDate(person.anniversary)}
                </p>
              </div>
            )}
            {person.address && (
              <div className="flex items-center gap-2 mt-1">
                <MapPin className="w-5 h-5 text-blue-500" aria-label="Map pin icon" />
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-500 hover:underline"
                >
                  {person.address}
                </a>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
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
