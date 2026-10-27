import type { SecretDescriptor } from '@rambleraptor/homestead-core/resources/secrets';

/** A credential as the API returns it: the value is only ever a descriptor. */
export interface Credential {
  id: string;
  path: string;
  name: string;
  description?: string;
  value: SecretDescriptor;
  created_by?: string;
  create_time: string;
  update_time: string;
}

/** What the form submits. `value` is a new secret, or absent/null to keep/clear it. */
export interface CredentialFormData {
  name: string;
  description?: string;
  value?: string | null;
}
