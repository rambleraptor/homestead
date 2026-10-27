/**
 * Add or edit a credential. Built on `SchemaForm`, whose `secret` widget shows
 * a stored value as "Set · …3f9a" with Replace — never the value itself — and
 * sends a new value only when one is typed.
 */

import { SchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { credentialsResources, OAUTH_FIELDS } from '../resources';
import type { Credential, CredentialFormData } from '../types';

const credentialDef = credentialsResources[0]!;
const hiddenOAuthFields = Object.fromEntries(OAUTH_FIELDS.map((field) => [field, { hidden: true, required: false }]));

interface CredentialFormProps {
  onSubmit: (data: CredentialFormData) => void | Promise<void>;
  onCancel: () => void;
  initialData?: Credential;
  isSubmitting?: boolean;
}

export function CredentialForm({ onSubmit, onCancel, initialData, isSubmitting }: CredentialFormProps) {
  const mode = initialData ? 'edit' : 'create';
  return (
    <SchemaForm<CredentialFormData>
      resource={credentialDef}
      mode={mode}
      initialData={initialData}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      testId="credential-form"
      submitTestId="credential-form-submit"
      cancelTestId="credential-form-cancel"
      submitLabel={mode === 'edit' ? 'Save' : 'Add credential'}
      layout={{ columns: 1 }}
      fields={{
        ...hiddenOAuthFields,
        name: { testId: 'credential-name', placeholder: 'e.g. OpenAI API key', autoFocus: true },
        description: {
          testId: 'credential-description',
          widget: 'textarea',
          placeholder: 'What uses it, where it came from',
        },
        value: {
          testId: 'credential-value',
          // Optional in the schema (an OAuth credential has none); a token needs one.
          required: true,
          label: 'Secret',
          help:
            mode === 'edit'
              ? 'Stored encrypted and never shown again. Replace it to rotate.'
              : 'Stored encrypted. Once saved it can be replaced, but nobody can read it back.',
        },
      }}
    />
  );
}
