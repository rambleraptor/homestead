/**
 * Set or replace a credential slot's value: just the secret — the slot already
 * has a name. Built on `SchemaForm`'s `secret` widget, like `CredentialForm`.
 */

import { SchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { credentialsResources } from '../resources';
import type { CredentialFormData, CredentialSlotStatus } from '../types';

const credentialDef = credentialsResources[0]!;

interface SlotValueFormProps {
  slot: CredentialSlotStatus;
  onSubmit: (value: string) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function SlotValueForm({ slot, onSubmit, onCancel, isSubmitting }: SlotValueFormProps) {
  return (
    <SchemaForm<CredentialFormData>
      resource={credentialDef}
      mode="create"
      onSubmit={(data) => onSubmit(data.value ?? '')}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      testId="slot-form"
      submitTestId="slot-form-submit"
      cancelTestId="slot-form-cancel"
      submitLabel="Save"
      layout={{ columns: 1 }}
      fields={{
        name: { hidden: true, required: false },
        description: { hidden: true },
        value: {
          testId: 'slot-value',
          label: slot.label,
          autoFocus: true,
          help: slot.stored
            ? 'Replaces the stored value. Stored encrypted and never shown again.'
            : 'Stored encrypted. Once saved it can be replaced, but nobody can read it back.',
        },
      }}
    />
  );
}
