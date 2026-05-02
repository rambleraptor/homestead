'use client';

import React from 'react';
import { Cake, Heart, Edit, Trash2, MapPin, Users } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { getMapUrl } from '../utils/mapUtils';
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
  const { user } = useAuth();
  const partner = person.partner;

  const formatDate = (dateString: string) => {
    // Extract just the date portion (YYYY-MM-DD) from PocketBase format (YYYY-MM-DD HH:MM:SS.sssZ)
    const datePortion = dateString.substring(0, 10);
    // Parse the date string to avoid timezone issues
    const [year, month, day] = datePortion.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    // Don't show year for annual events (birthdays and anniversaries)
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });
  };

  const formatAddress = (address: Person['addresses'][0]): string => {
    const parts = [
      address.line1,
      address.line2,
      address.city,
      address.state,
      address.postal_code,
      address.country,
    ].filter(Boolean);
    return parts.join(', ');
  };

  const mapProvider = user?.map_provider || 'google';

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{person.name}</h3>
              {partner && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Users className="w-3 h-3" aria-label="Partner icon" />
                  <span>{partner.name}</span>
                </div>
              )}
            </div>
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
            {person.addresses && person.addresses.length > 0 && (
              <div className="mt-1 space-y-2">
                {person.addresses.map((address, index) => {
                  const addressString = formatAddress(address);
                  const mapsUrl = getMapUrl(addressString, mapProvider);

                  return (
                    <div key={address.id || index}>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-blue-500" aria-label="Map pin icon" />
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-500 hover:underline"
                        >
                          {addressString}
                        </a>
                      </div>
                      {address.wifi_network && (
                        <div className="ml-7 mt-1 text-xs text-gray-600">
                          <span className="font-medium">WiFi:</span> {address.wifi_network}
                          {address.wifi_password && (
                            <span className="ml-2 font-mono">{address.wifi_password}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
