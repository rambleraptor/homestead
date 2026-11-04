/**
 * A toast about a record, with the record in it: the sentence ("Sam added
 * Water the plants") over the record's own card, so the person can act on it
 * where they are (tick it off, say) instead of going to find it. Rendered
 * inside a sonner toast by `useToast().record`; sonner leaves custom JSX
 * unstyled, so the box is ours, like `CelebrationToast`.
 */

import { RecordCard, type RecordCardHostProps } from '@rambleraptor/homestead-core/records/components/RecordCard';

export interface RecordToastProps {
  message: string;
  card: Omit<RecordCardHostProps, 'size'>;
}

export function RecordToast({ message, card }: RecordToastProps) {
  return (
    <div
      className="w-full space-y-2 rounded-2xl border border-gray-200 bg-surface-white px-4 py-3 text-sm shadow-lg"
      data-testid="record-toast"
    >
      <p className="font-medium text-text-main" data-testid="record-toast-message">
        {message}
      </p>
      <RecordCard {...card} size="row" />
    </div>
  );
}
