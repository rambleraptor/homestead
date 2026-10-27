/**
 * AI provider configuration for the server.
 *
 * The operator declares an `ai` block in homestead.config.ts (provider, model,
 * credentials). The server reads it via `registry.aiConfig()` at startup and
 * pushes it here with {@link setAiConfig} — core can't import the server's
 * registry (the dependency direction is server → core), so the server hands the
 * config down instead. Every AI call site then resolves the configured model
 * through {@link getAiModel} rather than reading env vars itself.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { EmbeddingModel, LanguageModel } from 'ai';
import type { AiConfig, EmbeddingConfig } from '../../apps/config';
import { resolveCredential } from '../credentials';

/**
 * The credential slots the AI keys fall back to (`apps/credential-slots.ts`):
 * when the config gives no key, `AI_API_KEY` / `EMBEDDING_API_KEY`, else the
 * key a superuser stored under Superuser → Credentials.
 */
export const AI_KEY_SLOT = { id: 'ai-api-key', env: 'AI_API_KEY' } as const;
export const EMBEDDING_KEY_SLOT = { id: 'embedding-api-key', env: 'EMBEDDING_API_KEY' } as const;

/** Where a key comes from: the config itself, a slot's env var or stored value. */
export type KeySource = 'config' | 'env' | 'stored';

/** A key from the config, else from its slot. Read on every use, so a stored key works at once. */
function resolveKey(
  configured: string | undefined,
  slot: { id: string; env: string },
): { apiKey: string; source: KeySource } | null {
  const fromConfig = configured?.trim();
  if (fromConfig) return { apiKey: fromConfig, source: 'config' };
  const resolved = resolveCredential(slot);
  return resolved ? { apiKey: resolved.value, source: resolved.source } : null;
}

/** The AI key and where it comes from, or null when there's none (or no `ai` block). */
export function aiKey(): { apiKey: string; source: KeySource } | null {
  return current ? resolveKey(current.auth?.apiKey, AI_KEY_SLOT) : null;
}

/** The embedding key and where it comes from, or null. */
export function embeddingKey(): { apiKey: string; source: KeySource } | null {
  return currentEmbedding ? resolveKey(currentEmbedding.auth?.apiKey, EMBEDDING_KEY_SLOT) : null;
}

let current: AiConfig | null = null;
let currentEmbedding: EmbeddingConfig | null = null;


/**
 * Install the instance's AI config. Called once by the server at startup with
 * `registry.aiConfig()` (which is `null` when the operator omitted the `ai`
 * block). Safe to call with `null` to leave AI disabled.
 */
export function setAiConfig(config: AiConfig | null): void {
  current = config;
}

/** The active AI config, or null when AI is unconfigured. */
export function getAiConfig(): AiConfig | null {
  return current;
}

/**
 * True when an AI provider is configured for this instance: an `ai` block and
 * a key — the block's own `auth.apiKey`, else `AI_API_KEY`, else the key stored
 * in Credentials. With none, callers return a clean 503 instead of letting the
 * provider SDK fall back to its own environment variable
 * (`GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, …).
 */
export function isAiConfigured(): boolean {
  return aiKey() !== null;
}

/** Thrown by {@link getAiModel} when no AI provider is configured. */
export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI is not configured on the server');
    this.name = 'AiNotConfiguredError';
  }
}

/**
 * Instantiate the configured provider's language model. Throws
 * {@link AiNotConfiguredError} when AI is unconfigured — callers should gate on
 * {@link isAiConfigured} and return 503 before reaching this.
 */
export function getAiModel(): LanguageModel {
  const cfg = current;
  const key = aiKey();
  if (!cfg || !key) throw new AiNotConfiguredError();

  const { apiKey } = key;
  // `baseURL: undefined` is the SDKs' own default, so passing it through
  // unconditionally keeps the cloud endpoints intact.
  const { baseURL } = cfg;
  switch (cfg.provider) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL })(cfg.model);
    case 'anthropic':
      return createAnthropic({ apiKey, baseURL })(cfg.model);
    case 'google':
      return createGoogleGenerativeAI({ apiKey, baseURL })(cfg.model);
  }
}

// ----------------------------------------------------------------------------
// Embedding provider — separate block; Anthropic has no embedding model.
// ----------------------------------------------------------------------------


/**
 * Install the instance's embedding config. Called once by the server at startup
 * with `registry.embeddingConfig()` (null when the operator omitted the
 * `embedding` block). Safe to call with `null` to leave embedding disabled.
 */
export function setEmbeddingConfig(config: EmbeddingConfig | null): void {
  currentEmbedding = config;
}

/** The active embedding config, or null when embedding is unconfigured. */
export function getEmbeddingConfig(): EmbeddingConfig | null {
  return currentEmbedding;
}

/**
 * True when an embedding provider is configured. Semantic search over
 * `ai.embed` file fields requires this in addition to {@link isAiConfigured}
 * (extraction still needs the language model).
 */
export function isEmbeddingConfigured(): boolean {
  return embeddingKey() !== null;
}

/** Thrown by {@link getEmbeddingModel} when no embedding provider is configured. */
export class EmbeddingNotConfiguredError extends Error {
  constructor() {
    super('Embedding is not configured on the server');
    this.name = 'EmbeddingNotConfiguredError';
  }
}

/**
 * Instantiate the configured embedding model. `modelOverride` lets a single
 * field pin a different model via `ai.embed.embedding_model`; it must be a
 * model of the *same* configured provider (there's one embedding provider per
 * instance). Throws {@link EmbeddingNotConfiguredError} when unconfigured.
 */
export function getEmbeddingModel(modelOverride?: string): EmbeddingModel {
  const cfg = currentEmbedding;
  const key = embeddingKey();
  if (!cfg || !key) throw new EmbeddingNotConfiguredError();

  const { apiKey } = key;
  const { baseURL } = cfg;
  const model = modelOverride || cfg.model;
  switch (cfg.provider) {
    case 'openai':
      return createOpenAI({ apiKey, baseURL }).textEmbeddingModel(model);
    case 'google':
      return createGoogleGenerativeAI({ apiKey, baseURL }).textEmbeddingModel(model);
  }
}

/**
 * The stable identity of the embedding model {@link getEmbeddingModel} would
 * resolve for the same `modelOverride` — a fully-qualified `provider:model`
 * string, e.g. `openai:text-embedding-3-small`. Persisted alongside every stored
 * vector (and stamped on every query) so the store never compares vectors across
 * models, and so a model swap is a clean re-embed rather than silent corruption.
 *
 * The provider is part of the identity on purpose: two providers can share a
 * model name yet embed into unrelated spaces. Throws
 * {@link EmbeddingNotConfiguredError} when unconfigured, mirroring
 * {@link getEmbeddingModel} — gate on {@link isEmbeddingConfigured} first.
 */
export function getEmbeddingModelId(modelOverride?: string): string {
  const cfg = currentEmbedding;
  if (!cfg || !embeddingKey()) throw new EmbeddingNotConfiguredError();
  return `${cfg.provider}:${modelOverride || cfg.model}`;
}
