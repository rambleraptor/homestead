/**
 * People Bulk Import - Person Preview Component
 */

import { User, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Checkbox } from '@/shared/components/Checkbox';
import { logger } from '@/core/utils/logger';
import type { ParsedItem } from '@/shared/bulk-import';
import type { PersonCSVData } from '../types';

interface PersonPreviewProps {
  item: ParsedItem<PersonCSVData>;
  isSelected: boolean;
  onToggle: () => void;
}

export function PersonPreview({ item, isSelected, onToggle }: PersonPreviewProps) {
  const person = item.data;

  const icon = <User className="h-5 w-5" />;

  const statusIcon = item.isValid ? (
    <CheckCircle2 className="h-5 w-5 text-green-600" />
  ) : (
    <XCircle className="h-5 w-5 text-destructive" />
  );

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (error) {
      logger.warn('Failed to format date', {
        error,
        date: dateString,
      });
      return dateString;
    }
  };

  return (
    <Card
      className={`p-4 transition-colors ${item.isValid
        ? isSelected
          ? 'border-primary bg-primary/5'
          : 'hover:border-primary/50'
        : 'border-destructive/50 bg-destructive/5 opacity-75'
        }`}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox (only for valid people) */}
        <div className="flex items-center pt-1">
          {item.isValid ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggle}
              aria-label={`Select ${person.name}`}
            />
          ) : (
            <div className="w-4 h-4" /> // Spacer for invalid people
          )}
        </div>

        {/* Person Icon */}
        <div className="flex-shrink-0 pt-1">{icon}</div>

        {/* Person Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg mb-1 break-words">
                {person.name || (
                  <span className="text-muted-foreground italic">No name</span>
                )}
              </h3>
              {person.address && (
                <p className="text-sm text-muted-foreground mb-1">
                  {person.address}
                </p>
              )}
              {person.birthday && (
                <p className="text-sm text-muted-foreground">
                  Birthday: {formatDate(person.birthday)}
                </p>
              )}
              {person.anniversary && (
                <p className="text-sm text-muted-foreground">
                  Anniversary: {formatDate(person.anniversary)}
                </p>
              )}
            </div>

            {/* Status Icon */}
            <div className="flex-shrink-0">{statusIcon}</div>
          </div>

          {/* Notification Preferences */}
          {person.notification_preferences &&
            person.notification_preferences.length > 0 &&
            item.isValid && (
              <div className="flex flex-wrap gap-1 mb-2">
                {person.notification_preferences.map((pref) => (
                  <span key={pref} className="text-xs bg-muted px-2 py-1 rounded">
                    {pref === 'day_of' && '🔔 Day of'}
                    {pref === 'day_before' && '🔔 Day before'}
                    {pref === 'week_before' && '🔔 Week before'}
                  </span>
                ))}
              </div>
            )}

          {/* Partner Name */}
          {person.partner_name && item.isValid && (
            <div className="flex flex-wrap gap-1 mb-2">
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                💑 Partner: {person.partner_name}
              </span>
            </div>
          )}

          {/* WiFi Info */}
          {person.wifi_network && item.isValid && (
            <div className="flex flex-wrap gap-1 mb-2">
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                📶 WiFi: {person.wifi_network}
              </span>
            </div>
          )}

          {/* Validation Errors */}
          {item.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {item.errors.map((error, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 text-sm text-destructive"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
