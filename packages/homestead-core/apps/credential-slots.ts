/**
 * Credential slots: an API key or token some part of Homestead needs, declared
 * where it's used so the Credentials page can show it, say what it's for, and
 * take its value — instead of leaving the operator to guess a name.
 *
 * A slot's value is a `credential` record whose id is the slot id
 * (`credentials/ai-api-key`). An environment variable, when the slot names one
 * and it's set, wins over the stored value. Server code reads a slot with
 * `resolveCredential` (`server/credentials.ts`).
 */

export interface CredentialSlot {
  /** Kebab-case, globally unique; also the stored credential's id. */
  id: string;
  /** "AI provider API key". */
  label: string;
  /** What it's for and what kind of key it must be. */
  description?: string;
  /** An environment variable that sets it instead, e.g. `AI_API_KEY`. */
  env?: string;
  /** Who uses it — "Assistant, receipt and document reading". Defaults to the app's name. */
  usedBy?: string;
  /** Where to get one: a sentence, or a URL. */
  help?: string;
}

/** A valid slot id: kebab-case, like a credential id must be. */
export const CREDENTIAL_SLOT_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
