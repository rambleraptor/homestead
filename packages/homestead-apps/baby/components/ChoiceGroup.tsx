import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

export interface Choice<T extends string> {
  value: T;
  label: string;
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  value: T | undefined;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
  /** Prefix for each option's test id: `<testId>-<value>`. */
  testId: string;
}

/** A row of thumb-sized options, one selected — a select that needs no menu. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
  testId,
}: ChoiceGroupProps<T>) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1 text-sm font-medium text-text-main">{label}</div>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-pressed={value === choice.value}
            data-testid={`${testId}-${choice.value}`}
            onClick={() => onChange(choice.value)}
            className={cn(
              'min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              value === choice.value
                ? 'border-brand-navy bg-brand-navy text-white'
                : 'border-gray-200 bg-surface-white text-text-main hover:bg-bg-pearl',
            )}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}
