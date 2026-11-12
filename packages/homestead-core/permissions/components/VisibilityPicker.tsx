/**
 * Who a new record is for: only the person making it, or the whole household.
 *
 * A create-form control for a resource declared `access: { model:
 * 'per-record' }`. It renders nothing for any other resource, so a form can
 * drop it in unconditionally. Visibility is fixed when a record is made (the
 * field is immutable), so an edit form must not offer it — state it there with
 * `VisibilityBadge` instead.
 */

import { Lock, Users } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { recordVisibility } from '../visibility';

export interface VisibilityPickerProps {
  /** The resource's `singular`. */
  singular: string;
  /** The chosen value; an unknown or empty one reads as the resource's default. */
  value: string;
  onChange: (value: string) => void;
  /**
   * Icons only, for a tight row; the labels stay for screen readers. Without
   * it the labels still fold away on a phone-width screen.
   */
  compact?: boolean;
  /** Keep the labels at every width, where the row has room for them. */
  alwaysLabeled?: boolean;
  className?: string;
}

export function VisibilityPicker({
  singular,
  value,
  onChange,
  compact = false,
  alwaysLabeled = false,
  className,
}: VisibilityPickerProps) {
  const visibility = recordVisibility(singular);
  if (!visibility) return null;
  const options = [
    { value: visibility.privateValue, label: 'Private', hint: 'Only you can see it', icon: Lock },
    { value: visibility.sharedValue, label: 'Family', hint: 'Everyone in the household can see it', icon: Users },
  ];
  const current = options.some((option) => option.value === value) ? value : visibility.defaultValue;

  return (
    <div
      role="radiogroup"
      aria-label="Who can see it"
      className={cn('inline-flex shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-0.5', className)}
      data-testid="visibility-picker"
    >
      {options.map(({ value: option, label, hint, icon: Icon }) => {
        const selected = option === current;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={compact ? label : undefined}
            title={hint}
            onClick={() => onChange(option)}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
              selected ? 'bg-surface-white text-brand-navy shadow-sm' : 'text-text-muted hover:text-text-main',
            )}
            data-testid={`visibility-${option}`}
          >
            <Icon className="size-4" aria-hidden />
            {!compact && <span className={alwaysLabeled ? undefined : 'sr-only sm:not-sr-only'}>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
