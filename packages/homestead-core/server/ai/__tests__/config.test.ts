/**
 * Tests for AI provider selection. These never hit the network — instantiating
 * a provider model only builds a spec object.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  setAiConfig,
  getAiConfig,
  isAiConfigured,
  getAiModel,
  AiNotConfiguredError,
  setEmbeddingConfig,
  getEmbeddingConfig,
  isEmbeddingConfigured,
  getEmbeddingModel,
  EmbeddingNotConfiguredError,
  aiKey,
  embeddingKey,
} from '../config';
import { setSecretReader } from '../../secrets';
import type { AiProvider, EmbeddingProvider } from '../../../apps/config';

afterEach(() => {
  setAiConfig(null);
  setEmbeddingConfig(null);
});

describe('AI config', () => {
  it('reports unconfigured by default and throws from getAiModel', () => {
    setAiConfig(null);
    expect(isAiConfigured()).toBe(false);
    expect(getAiConfig()).toBeNull();
    expect(() => getAiModel()).toThrow(AiNotConfiguredError);
  });

  it('instantiates a model for each supported provider', () => {
    const providers: AiProvider[] = ['openai', 'anthropic', 'google'];
    for (const provider of providers) {
      setAiConfig({ provider, model: 'test-model', auth: { apiKey: 'fake-key' } });
      expect(isAiConfigured()).toBe(true);
      // A LanguageModel is an object (or string id); just assert we got one.
      expect(getAiModel()).toBeTruthy();
    }
  });

  it('treats a blank apiKey as unconfigured (no SDK env fallback)', () => {
    // An `ai` block whose key resolves to '' (e.g. its env var is unset in
    // homestead.config.ts) must report unconfigured, so callers 503 rather
    // than letting the provider SDK reach for its own env var.
    setAiConfig({ provider: 'google', model: 'gemini-2.5-flash', auth: { apiKey: '' } });
    expect(isAiConfigured()).toBe(false);
    expect(() => getAiModel()).toThrow(AiNotConfiguredError);

    setAiConfig({ provider: 'google', model: 'gemini-2.5-flash', auth: { apiKey: '   ' } });
    expect(isAiConfigured()).toBe(false);
    expect(() => getAiModel()).toThrow(AiNotConfiguredError);
  });

  it('round-trips the active config', () => {
    const cfg = {
      provider: 'anthropic' as const,
      model: 'claude-3-5-sonnet-latest',
      auth: { apiKey: 'k' },
    };
    setAiConfig(cfg);
    expect(getAiConfig()).toEqual(cfg);
  });
});

describe('embedding config', () => {
  it('is independent of the chat config and unconfigured by default', () => {
    setAiConfig({ provider: 'anthropic', model: 'claude', auth: { apiKey: 'k' } });
    // Chat configured, but embedding is a separate block — still off.
    expect(isAiConfigured()).toBe(true);
    expect(isEmbeddingConfigured()).toBe(false);
    expect(getEmbeddingConfig()).toBeNull();
    expect(() => getEmbeddingModel()).toThrow(EmbeddingNotConfiguredError);
  });

  it('instantiates an embedding model for each embedding provider', () => {
    const providers: EmbeddingProvider[] = ['openai', 'google'];
    for (const provider of providers) {
      setEmbeddingConfig({ provider, model: 'test-embed', auth: { apiKey: 'fake-key' } });
      expect(isEmbeddingConfigured()).toBe(true);
      expect(getEmbeddingModel()).toBeTruthy();
    }
  });

  it('honors a per-field model override', () => {
    setEmbeddingConfig({ provider: 'openai', model: 'text-embedding-3-small', auth: { apiKey: 'k' } });
    // Override resolves without throwing (same provider, different model id).
    expect(getEmbeddingModel('text-embedding-3-large')).toBeTruthy();
  });

  it('treats a blank apiKey as unconfigured', () => {
    setEmbeddingConfig({ provider: 'openai', model: 'text-embedding-3-small', auth: { apiKey: '  ' } });
    expect(isEmbeddingConfigured()).toBe(false);
    expect(() => getEmbeddingModel()).toThrow(EmbeddingNotConfiguredError);
  });
});

describe('keys from credential slots', () => {
  const realAi = process.env.AI_API_KEY;
  const realEmbedding = process.env.EMBEDDING_API_KEY;
  const stored = new Map<string, string>();

  beforeEach(() => {
    delete process.env.AI_API_KEY;
    delete process.env.EMBEDDING_API_KEY;
    stored.clear();
    setSecretReader((resource, path, field) =>
      resource === 'credential' && field === 'value' ? (stored.get(path) ?? null) : null,
    );
  });

  afterEach(() => {
    setSecretReader(null);
    if (realAi === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = realAi;
    if (realEmbedding === undefined) delete process.env.EMBEDDING_API_KEY;
    else process.env.EMBEDDING_API_KEY = realEmbedding;
  });

  it('with no key in the config, takes the stored one, read on each use', () => {
    setAiConfig({ provider: 'google', model: 'gemini-2.5-flash' });
    expect(isAiConfigured()).toBe(false);
    stored.set('credentials/ai-api-key', 'stored-key');
    expect(aiKey()).toEqual({ apiKey: 'stored-key', source: 'stored' });
    expect(isAiConfigured()).toBe(true);
    expect(getAiModel()).toBeDefined();
  });

  it('AI_API_KEY wins over the stored key, and the config’s own key over both', () => {
    stored.set('credentials/ai-api-key', 'stored-key');
    process.env.AI_API_KEY = 'env-key';
    setAiConfig({ provider: 'google', model: 'gemini-2.5-flash', auth: { apiKey: '  ' } });
    expect(aiKey()).toEqual({ apiKey: 'env-key', source: 'env' });
    setAiConfig({ provider: 'google', model: 'gemini-2.5-flash', auth: { apiKey: 'config-key' } });
    expect(aiKey()).toEqual({ apiKey: 'config-key', source: 'config' });
  });

  it('no `ai` block means no AI, whatever is stored', () => {
    stored.set('credentials/ai-api-key', 'stored-key');
    setAiConfig(null);
    expect(isAiConfigured()).toBe(false);
  });

  it('a stored key that can’t be read counts as missing', () => {
    setSecretReader(() => {
      throw new Error('no master key');
    });
    setAiConfig({ provider: 'google', model: 'gemini-2.5-flash' });
    expect(isAiConfigured()).toBe(false);
  });

  it('embeddings take EMBEDDING_API_KEY, else their own stored key', () => {
    setEmbeddingConfig({ provider: 'openai', model: 'text-embedding-3-small' });
    stored.set('credentials/embedding-api-key', 'stored-embed');
    expect(embeddingKey()).toEqual({ apiKey: 'stored-embed', source: 'stored' });
    process.env.EMBEDDING_API_KEY = 'env-embed';
    expect(embeddingKey()).toEqual({ apiKey: 'env-embed', source: 'env' });
    expect(isEmbeddingConfigured()).toBe(true);
  });
});
