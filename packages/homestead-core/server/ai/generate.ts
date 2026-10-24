/**
 * The unified server-side AI API.
 *
 * Every AI call in Homestead goes through one of these three primitives, so the
 * provider/model is chosen once (in homestead.config.ts) and no call site talks
 * to a provider SDK directly:
 *
 * - {@link aiGenerateText}   — plain or multimodal text completion.
 * - {@link aiGenerateObject} — schema-validated structured output.
 * - {@link aiRunAgent}       — a tool-calling agentic loop (the chat assistant).
 * - {@link aiEmbed}          — batch text embedding (semantic search index).
 *
 * The first three resolve the configured model via {@link getAiModel} (gate on
 * {@link isAiConfigured}); {@link aiEmbed} uses the separate embedding model via
 * {@link getEmbeddingModel} (gate on `isEmbeddingConfigured`).
 */

import {
  embedMany,
  generateText,
  generateObject,
  NoObjectGeneratedError,
  stepCountIs,
  streamText,
  type JSONValue,
  type ModelMessage,
  type StepResult,
  type ToolSet,
} from 'ai';
import type { z } from 'zod';
import { getAiModel, getEmbeddingModel } from './config';

/**
 * Per-provider generation options, keyed by provider name (e.g.
 * `{ google: { thinkingConfig: … } }`). Mirrors the AI SDK's `ProviderOptions`
 * (`Record<string, Record<string, JSONValue>>`), aliased locally because `ai`
 * uses that type internally without re-exporting it.
 */
type ProviderOptions = Record<string, Record<string, JSONValue>>;

/** JSON.stringify that can't throw on a circular/odd value — logging must not fail. */
function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * When structured generation yields no object, the model *did* respond — the
 * why (a malformed function call, a safety block, a truncated body) lives in the
 * provider's raw response, which the default error dump collapses to
 * `body: [Object ...]`. Surface the fields that actually explain the failure so
 * the next occurrence is diagnosable from the logs alone.
 */
function logNoObjectGenerated(err: unknown): void {
  if (!NoObjectGeneratedError.isInstance(err)) return;
  console.error(
    '[ai] generateObject produced no object:\n' +
      safeJson({
        finishReason: err.finishReason,
        usage: err.usage,
        // The partial text the model did return (often empty on "other").
        text: err.text,
        // The gold: the provider's raw response — real finishReason,
        // safetyRatings, promptFeedback, any partial candidate content.
        responseBody: err.response?.body,
      }),
  );
}

// Re-exported so call sites build messages/tools from a single import surface.
export type { ModelMessage, ToolSet } from 'ai';
export { tool } from 'ai';

/**
 * The model's input: either a plain text `prompt` or a `messages` array (used
 * for history and multimodal/image parts). The SDK requires exactly one, so we
 * build it here rather than passing both as possibly-undefined.
 */
function promptInput(opts: { prompt?: string; messages?: ModelMessage[] }):
  | { messages: ModelMessage[] }
  | { prompt: string } {
  return opts.messages !== undefined
    ? { messages: opts.messages }
    : { prompt: opts.prompt ?? '' };
}

/** Plain or multimodal text completion. Returns the model's text reply. */
export async function aiGenerateText(opts: {
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
}): Promise<string> {
  const { text } = await generateText({
    model: getAiModel(),
    system: opts.system,
    ...promptInput(opts),
  });
  return text;
}

/**
 * Structured generation validated against a Zod schema. Returns the parsed
 * object, typed to the schema. Image parts (for vision extraction) go in
 * `messages`.
 *
 * `maxOutputTokens` and `providerOptions` are passed straight through for
 * callers that need to shape the generation — e.g. capping a thinking model's
 * reasoning budget so it reserves tokens for the actual answer instead of
 * terminating mid-thought. `providerOptions` is keyed by provider name, so a
 * `{ google: … }` block is simply ignored under a different configured provider.
 */
export async function aiGenerateObject<T>(opts: {
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  providerOptions?: ProviderOptions;
}): Promise<T> {
  try {
    const { object } = await generateObject({
      model: getAiModel(),
      schema: opts.schema,
      system: opts.system,
      maxOutputTokens: opts.maxOutputTokens,
      providerOptions: opts.providerOptions,
      ...promptInput(opts),
    });
    return object;
  } catch (err) {
    logNoObjectGenerated(err);
    throw err;
  }
}

/**
 * Run a tool-calling agentic turn. The SDK invokes each tool's `execute` and
 * feeds the result back to the model, looping up to `maxRounds` model steps
 * before returning the final text. Returns the text plus the per-step record
 * (tool calls/results) for callers that need it.
 */
export async function aiRunAgent<TOOLS extends ToolSet>(opts: {
  system: string;
  messages: ModelMessage[];
  tools: TOOLS;
  maxRounds: number;
}): Promise<{ text: string; steps: StepResult<TOOLS>[] }> {
  const { text, steps } = await generateText({
    model: getAiModel(),
    system: opts.system,
    messages: opts.messages,
    tools: opts.tools,
    stopWhen: stepCountIs(opts.maxRounds),
  });
  return { text, steps };
}

/**
 * Stream a tool-calling agentic turn on the configured model: `streamText`
 * with the model filled in and the round limit expressed as `maxRounds`, like
 * {@link aiRunAgent}. Every other option (callbacks, `abortSignal`, …) passes
 * straight through, and the result is the SDK's own, so a caller can turn it
 * into a UI message stream.
 */
export function aiStreamAgent(
  opts: Omit<Parameters<typeof streamText>[0], 'model' | 'stopWhen'> & { maxRounds: number },
): ReturnType<typeof streamText> {
  const { maxRounds, ...rest } = opts;
  return streamText({
    ...rest,
    model: getAiModel(),
    stopWhen: stepCountIs(maxRounds),
  } as Parameters<typeof streamText>[0]);
}

/**
 * Embed a batch of texts with the configured embedding model. Returns one
 * vector per input, order-aligned with `values` (empty in → empty out).
 * `model` optionally overrides the instance embedding model for a single field
 * (`ai.embed.embedding_model`). Callers should gate on `isEmbeddingConfigured`
 * and return 503 first when embedding may be unconfigured.
 */
export async function aiEmbed(
  values: string[],
  opts?: { model?: string },
): Promise<number[][]> {
  if (values.length === 0) return [];
  const { embeddings } = await embedMany({
    model: getEmbeddingModel(opts?.model),
    values,
  });
  return embeddings;
}
