/**
 * The credentials Homestead needs, and whether each is set — what Superuser →
 * Credentials shows under "Homestead needs" (`GET /api/credential-slots`).
 *
 * Core's own slots are the AI and embedding keys, present when their config
 * block is; apps add theirs with `credentials` on their `AppConfig`. A status
 * says where a slot's value comes from — never the value.
 */

import type { SecretDescriptor } from '../resources/secrets';
import { getAllCredentialSlots } from '../apps/registry';
import type { CredentialSlot } from '../apps/credential-slots';
import type { AiProvider } from '../apps/config';
import { CREDENTIALS } from '../superuser/credentials/resources';
import type { Credential } from '../superuser/credentials/types';
import {
  AI_KEY_SLOT,
  EMBEDDING_KEY_SLOT,
  aiKey,
  embeddingKey,
  getAiConfig,
  getEmbeddingConfig,
  type KeySource,
} from './ai/config';
import { serverClient } from './client';
import { resolveCredential } from './credentials';

/** A slot as the Credentials page shows it. */
export interface CredentialSlotStatus {
  id: string;
  label: string;
  description?: string;
  help?: string;
  env?: string;
  used_by: string;
  /** Where its value comes from now, or `missing`. */
  source: KeySource | 'missing';
  /** The stored credential's descriptor, when one is stored. */
  stored: SecretDescriptor | null;
  /** A stored value exists, but the config or the env var wins over it. */
  overridden: boolean;
}

const PROVIDERS: Record<AiProvider, { name: string; keys: string }> = {
  google: { name: 'Google Gemini', keys: 'https://aistudio.google.com/apikey' },
  openai: { name: 'OpenAI', keys: 'https://platform.openai.com/api-keys' },
  anthropic: { name: 'Anthropic (Claude)', keys: 'https://console.anthropic.com/settings/keys' },
};

/** The AI and embedding keys, when their blocks are configured, described for their provider. */
function coreSlots(): Array<CredentialSlot & { usedBy: string; source: () => KeySource | null }> {
  const out: Array<CredentialSlot & { usedBy: string; source: () => KeySource | null }> = [];
  const ai = getAiConfig();
  if (ai) {
    const provider = PROVIDERS[ai.provider];
    out.push({
      ...AI_KEY_SLOT,
      label: 'AI provider API key',
      description:
        `An API key for ${provider.name}, which runs the assistant (model ${ai.model})` +
        (ai.baseURL ? `, at ${ai.baseURL}` : '') +
        '. The provider and model come from AI_PROVIDER and AI_MODEL.',
      help: provider.keys,
      usedBy: 'Assistant, receipt and document reading',
      source: () => aiKey()?.source ?? null,
    });
  }
  const embedding = getEmbeddingConfig();
  if (embedding) {
    const provider = PROVIDERS[embedding.provider];
    out.push({
      ...EMBEDDING_KEY_SLOT,
      label: 'Embedding API key',
      description:
        `An API key for ${provider.name}, which indexes documents for search (model ${embedding.model}).` +
        ' Often the same key as the AI provider’s.',
      help: provider.keys,
      usedBy: 'Document search',
      source: () => embeddingKey()?.source ?? null,
    });
  }
  return out;
}

/** Every slot, core's first, with where its value comes from. */
export function credentialSlots(): Array<CredentialSlot & { usedBy: string; source: KeySource | null }> {
  const core = coreSlots().map(({ source, ...slot }) => ({ ...slot, source: source() }));
  const taken = new Set(core.map((s) => s.id));
  const apps = getAllCredentialSlots()
    .filter((slot) => !taken.has(slot.id))
    .map(({ appId: _appId, appName, ...slot }) => ({
      ...slot,
      usedBy: slot.usedBy ?? appName,
      source: resolveCredential(slot)?.source ?? null,
    }));
  return [...core, ...apps];
}

/**
 * Every slot's status for the Credentials page. `token` is the superuser's
 * own: the stored credentials are read as they would read them, descriptors
 * only.
 */
export async function credentialSlotStatuses(token: string): Promise<CredentialSlotStatus[]> {
  const stored = new Map(
    (await serverClient(token).collection<Credential>(CREDENTIALS).listAll()).map((c) => [c.id, c.value]),
  );
  return credentialSlots().map((slot) => {
    const descriptor = stored.get(slot.id);
    const storedSet = descriptor?.set === true;
    return {
      id: slot.id,
      label: slot.label,
      ...(slot.description ? { description: slot.description } : {}),
      ...(slot.help ? { help: slot.help } : {}),
      ...(slot.env ? { env: slot.env } : {}),
      used_by: slot.usedBy,
      source: slot.source ?? 'missing',
      stored: storedSet ? descriptor! : null,
      overridden: storedSet && (slot.source === 'env' || slot.source === 'config'),
    };
  });
}
