/**
 * Reusable Bulk Import Framework - Default Item Preview Component
 */

import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/Checkbox';
import type { ParsedItem } from './types';

interface DefaultItemPreviewProps<T> {
  item: ParsedItem<T>;
  isSelected: boolean;
  onToggle: () => void;
}

/**
 * Default preview component - displays data as key-value pairs
 * Modules should provide their own custom preview component for better UX
 */
export function DefaultItemPreview<T>({
  item,
  isSelected,
  onToggle,
}: DefaultItemPreviewProps<T>) {
  const statusIcon = item.isValid ? (
    <CheckCircle2 className="h-5 w-5 text-green-600" />
  ) : (
    <XCircle className="h-5 w-5 text-destructive" />
  );

  return (
    <Card
      className={`p-4 transition-colors ${
        item.isValid
          ? isSelected
            ? 'border-primary bg-primary/5'
            : 'hover:border-primary/50'
          : 'border-destructive/50 bg-destructive/5 opacity-75'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox (only for valid items) */}
        <div className="flex items-center pt-1">
          {item.isValid ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggle}
              aria-label="Select item"
            />
          ) : (
            <div className="w-4 h-4" /> // Spacer for invalid items
          )}
        </div>

        {/* Item Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex-1 min-w-0">
              {/* Display all data fields */}
              <div className="space-y-1">
                {Object.entries(item.data as Record<string, unknown>).map(
                  ([key, value]) => (
                    <div key={key} className="text-sm">
                      <span className="font-medium">{key}:</span>{' '}
                      <span className="text-muted-foreground">
                        {String(value ?? '')}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Status Icon */}
            <div className="flex-shrink-0">{statusIcon}</div>
          </div>

          {/* Error Messages */}
          {!item.isValid && item.errors.length > 0 && (
            <div className="mt-3 p-3 bg-destructive/10 rounded-md border border-destructive/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive mb-1">
                    Row {item.rowNumber} - Cannot import this item:
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    {item.errors.map((error, idx) => (
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
