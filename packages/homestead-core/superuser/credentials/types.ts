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

/** A credential Homestead needs, as `GET /api/credential-slots` reports it. Never a value. */
export interface CredentialSlotStatus {
  id: string;
  label: string;
  description?: string;
  /** Where to get one: a sentence or a URL. */
  help?: string;
  /** The environment variable that sets it instead. */
  env?: string;
  used_by: string;
  /** Where its value comes from now. */
  source: 'config' | 'env' | 'stored' | 'missing';
  /** The stored credential's descriptor, when one is stored. */
  stored: SecretDescriptor | null;
  /** A stored value exists, but the config or the env var wins over it. */
  overridden: boolean;
}
