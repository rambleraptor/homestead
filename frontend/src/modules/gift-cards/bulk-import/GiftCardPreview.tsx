/**
 * Gift Cards Bulk Import - Gift Card Preview Component
 */

import { CreditCard, CheckCircle2, XCircle, AlertCircle, Archive } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Checkbox } from '@/shared/components/Checkbox';
import { formatCurrency } from '@/shared/utils/currencyUtils';
import type { ParsedItem } from '@/shared/bulk-import';
import type { GiftCardImportData } from './schema';

interface GiftCardPreviewProps {
  item: ParsedItem<GiftCardImportData>;
  isSelected: boolean;
  onToggle: () => void;
}

export function GiftCardPreview({
  item,
  isSelected,
  onToggle,
}: GiftCardPreviewProps) {
  const giftCard = item.data;

  const statusIcon = item.isValid ? (
    <CheckCircle2 className="h-5 w-5 text-green-600" />
  ) : (
    <XCircle className="h-5 w-5 text-destructive" />
  );

  // Format amount with currency
  const formattedAmount = giftCard.amount
    ? formatCurrency(giftCard.amount)
    : formatCurrency(0);

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
        {/* Checkbox (only for valid gift cards) */}
        <div className="flex items-center pt-1">
          {item.isValid ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggle}
              aria-label={`Select ${giftCard.merchant} gift card`}
            />
          ) : (
            <div className="w-4 h-4" /> // Spacer for invalid gift cards
          )}
        </div>

        {/* Gift Card Icon */}
        <div className="flex-shrink-0 pt-1">
          <CreditCard className="h-5 w-5" />
        </div>

        {/* Gift Card Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg mb-1 break-words">
                {giftCard.merchant || (
                  <span className="text-muted-foreground italic">No merchant</span>
                )}
              </h3>
              <p className="text-sm text-muted-foreground mb-1">
                Card: {giftCard.card_number || (
                  <span className="italic">No card number</span>
                )}
              </p>
              {giftCard.pin && (
                <p className="text-sm text-muted-foreground mb-1">
                  PIN: {giftCard.pin}
                </p>
              )}
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold text-green-600">
                  {formattedAmount}
                </p>
                {giftCard.archived && (
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded flex items-center gap-1">
                    <Archive className="h-3 w-3" />
                    Archived
                  </span>
                )}
              </div>
            </div>

            {/* Status Icon */}
            <div className="flex-shrink-0">{statusIcon}</div>
          </div>

          {/* Notes */}
          {giftCard.notes && item.isValid && (
            <p className="text-sm text-muted-foreground mb-2 italic">
              "{giftCard.notes}"
            </p>
          )}

          {/* Error Messages */}
          {!item.isValid && item.errors.length > 0 && (
            <div className="mt-3 p-3 bg-destructive/10 rounded-md border border-destructive/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive mb-1">
                    Row {item.rowNumber} - Cannot import this gift card:
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
