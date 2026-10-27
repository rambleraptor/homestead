/**
 * Set or replace a credential slot's value: just the secret — the slot already
 * has a name. Built on `SchemaForm`'s `secret` widget, like `CredentialForm`.
 */

import { SchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { credentialsResources, OAUTH_FIELDS } from '../resources';
import type { CredentialFormData, CredentialSlotStatus } from '../types';

const credentialDef = credentialsResources[0]!;
const hiddenOAuthFields = Object.fromEntries(OAUTH_FIELDS.map((field) => [field, { hidden: true, required: false }]));

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
        ...hiddenOAuthFields,
        name: { hidden: true, required: false },
        description: { hidden: true },
        value: {
          testId: 'slot-value',
          // Optional in the schema (an OAuth credential has none); a token needs one.
          required: true,
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
