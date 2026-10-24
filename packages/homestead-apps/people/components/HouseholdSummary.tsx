/**
 * One household's address (as a map link) and WiFi. Used on person cards, the
 * person detail page and the Households page.
 */

import { Home, MapPin } from 'lucide-react';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import type { Household } from '../types';
import { formatAddress } from '../utils/households';
import { getMapUrl } from '../utils/mapUtils';

interface HouseholdSummaryProps {
  household: Household;
  /** Show the household's name above its address (person views do). */
  showName?: boolean;
}

export function HouseholdSummary({ household, showName = false }: HouseholdSummaryProps) {
  const { user } = useAuth();
  const address = formatAddress(household);
  const mapProvider = user?.map_provider || 'google';

  return (
    <div data-testid={`household-summary-${household.id}`}>
      {showName && (
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Home className="w-4 h-4 text-gray-400" aria-label="Household icon" />
          <span className="font-medium">{household.name}</span>
        </div>
      )}
      {address && (
        <div className="flex items-center gap-2 mt-1">
          <MapPin className="w-5 h-5 text-blue-500" aria-label="Map pin icon" />
          <a
            href={getMapUrl(address, mapProvider)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:underline"
          >
            {address}
          </a>
        </div>
      )}
      {household.wifi_network && (
        <div className="ml-7 mt-1 text-xs text-gray-600">
          <span className="font-medium">WiFi:</span> {household.wifi_network}
          {household.wifi_password && (
            <span className="ml-2 font-mono">{household.wifi_password}</span>
          )}
        </div>
      )}
    </div>
  );
}
