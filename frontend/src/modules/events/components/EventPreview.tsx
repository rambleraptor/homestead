import { Cake, Heart, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Card } from '../../../shared/components/Card';
import { Checkbox } from '../../../shared/components/Checkbox';
import type { ParsedEvent } from '../utils/csvParser';

interface EventPreviewProps {
  event: ParsedEvent;
  isSelected: boolean;
  onToggle: () => void;
}

export function EventPreview({ event, isSelected, onToggle }: EventPreviewProps) {
  const icon = event.event_type === 'birthday' ? (
    <Cake className="h-5 w-5" />
  ) : (
    <Heart className="h-5 w-5" />
  );

  const statusIcon = event.isValid ? (
    <CheckCircle2 className="h-5 w-5 text-green-600" />
  ) : (
    <XCircle className="h-5 w-5 text-destructive" />
  );

  // Format date for display
  let formattedDate = event.event_date;
  try {
    if (event.event_date && event.isValid) {
      const date = new Date(event.event_date);
      formattedDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
  } catch {
    // Keep original format if parsing fails
  }

  return (
    <Card
      className={`p-4 transition-colors ${
        event.isValid
          ? isSelected
            ? 'border-primary bg-primary/5'
            : 'hover:border-primary/50'
          : 'border-destructive/50 bg-destructive/5 opacity-75'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox (only for valid events) */}
        <div className="flex items-center pt-1">
          {event.isValid ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggle}
              aria-label={`Select ${event.title}`}
            />
          ) : (
            <div className="w-4 h-4" /> // Spacer for invalid events
          )}
        </div>

        {/* Event Icon */}
        <div className="flex-shrink-0 pt-1">
          {icon}
        </div>

        {/* Event Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg mb-1 break-words">
                {event.title || <span className="text-muted-foreground italic">No title</span>}
              </h3>
              <p className="text-sm text-muted-foreground mb-1">
                {event.people_involved || <span className="italic">No people specified</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                {formattedDate}
                {event.recurring_yearly && <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Recurring</span>}
              </p>
            </div>

            {/* Status Icon */}
            <div className="flex-shrink-0">
              {statusIcon}
            </div>
          </div>

          {/* Additional Details */}
          {event.details && event.isValid && (
            <p className="text-sm text-muted-foreground mb-2 italic">
              "{event.details}"
            </p>
          )}

          {/* Notification Preferences */}
          {event.notification_preferences.length > 0 && event.isValid && (
            <div className="flex flex-wrap gap-1 mb-2">
              {event.notification_preferences.map((pref) => (
                <span
                  key={pref}
                  className="text-xs bg-muted px-2 py-1 rounded"
                >
                  {pref === 'day_of' && '🔔 Day of'}
                  {pref === 'day_before' && '🔔 Day before'}
                  {pref === 'week_before' && '🔔 Week before'}
                </span>
              ))}
            </div>
          )}

          {/* Error Messages */}
          {!event.isValid && event.errors.length > 0 && (
            <div className="mt-3 p-3 bg-destructive/10 rounded-md border border-destructive/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive mb-1">
                    Row {event.rowNumber} - Cannot import this event:
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    {event.errors.map((error, idx) => (
                      <li key={idx} className="text-xs text-destructive/90">
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
