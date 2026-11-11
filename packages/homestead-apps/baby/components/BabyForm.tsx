import { useState, type FormEvent } from 'react';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { Input } from '@rambleraptor/homestead-core/shared/components/ui/input';
import { Label } from '@rambleraptor/homestead-core/shared/components/ui/label';
import { useCreateBaby, useUpdateBaby } from '../hooks/useBabies';
import type { Baby } from '../types';

interface BabyFormProps {
  /** The baby being edited; absent to add one. */
  baby?: Baby;
  onSaved: (baby: Baby) => void;
  onCancel?: () => void;
}

/** A baby's name and birth date — both fine to fill in before the birth. */
export function BabyForm({ baby, onSaved, onCancel }: BabyFormProps) {
  const createBaby = useCreateBaby();
  const updateBaby = useUpdateBaby();
  const [name, setName] = useState(baby?.name ?? '');
  const [birthDate, setBirthDate] = useState(baby?.birth_date ?? '');
  const [nameError, setNameError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Enter a name — a nickname is fine for now.');
      return;
    }
    setNameError(undefined);
    try {
      if (baby) {
        const updated = await updateBaby.mutateAsync({
          id: baby.id,
          data: { name: trimmed, birth_date: birthDate || null },
        });
        onSaved(updated ?? { ...baby, name: trimmed, birth_date: birthDate || undefined });
      } else {
        onSaved(
          await createBaby.mutateAsync({ name: trimmed, ...(birthDate ? { birth_date: birthDate } : {}) }),
        );
      }
    } catch {
      // The mutation's toast reports it; the form stays open.
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="baby-form" noValidate>
      <div>
        <Label htmlFor="baby-name">Name</Label>
        <Input
          id="baby-name"
          data-testid="baby-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Baby"
          aria-invalid={!!nameError}
        />
        {nameError && (
          <p className="mt-1 text-sm text-red-600" role="alert" data-testid="baby-name-error">
            {nameError}
          </p>
        )}
      </div>
      <div>
        <Label htmlFor="baby-birth-date">Birth date</Label>
        <Input
          id="baby-birth-date"
          data-testid="baby-birth-date-input"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        <p className="mt-1 text-xs text-text-muted">Leave blank until the baby arrives.</p>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={createBaby.isPending || updateBaby.isPending}
          data-testid="baby-form-save"
        >
          Save
        </Button>
      </div>
    </form>
  );
}
