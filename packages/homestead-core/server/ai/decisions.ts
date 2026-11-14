/**
 * The Gemini Decisions API: closed-set answers (pick one of these options)
 * with no text generated, for work that is a decision rather than a reply —
 * which shelf an item is on, which inbox a message belongs in.
 *
 * It is Google's own endpoint, not something the configured chat provider
 * speaks, so it takes a Gemini key of its own: the {@link GEMINI_KEY_SLOT}
 * credential, else the AI key when the instance's provider is already Google.
 *
 * One request carries a shared input and up to {@link MAX_QUESTIONS} questions,
 * each answered independently; {@link decideChoices} splits a longer set across
 * requests. Docs: https://aistudio.google.com/docs/decisions-api
 */

import { resolveCredential } from '../credentials';
import { aiKey, getAiConfig } from './config';

/** The Gemini key the Decisions API is called with (`apps/credential-slots.ts`). */
export const GEMINI_KEY_SLOT = { id: 'gemini-api-key', env: 'GEMINI_API_KEY' } as const;

export const DECISION_MODEL = 'gemini-decision-1';
/** The API's limit on questions in one request. */
export const MAX_QUESTIONS = 1000;

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 30_000;

/** Overridable so tests can serve the endpoint in-process. */
function baseUrl(): string {
  return (process.env.GEMINI_DECISIONS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * The key to call with, or null. The AI key is reused only when it is a key for
 * Google's own endpoint: a `google` provider pointed at a proxy (`baseURL`)
 * holds the proxy's key, which must not be sent to Google.
 */
function decisionsKey(): string | null {
  const own = resolveCredential(GEMINI_KEY_SLOT);
  if (own) return own.value;
  return usesAiKeyForDecisions() ? (aiKey()?.apiKey ?? null) : null;
}

/** True when the instance's AI key is a key for Google's own endpoint, so no second key is needed. */
export function usesAiKeyForDecisions(): boolean {
  const cfg = getAiConfig();
  return cfg?.provider === 'google' && !cfg.baseURL;
}

/** True when there is a Gemini key to call the Decisions API with. */
export function isDecisionsConfigured(): boolean {
  return decisionsKey() !== null;
}

/** A multiple-choice question: option id → what belongs under it. */
export interface ChoiceQuestion {
  /** The whole question; the model never sees the question's key. */
  instructions: string;
  /** 2–255 options. A description may be '' when the id says it all. */
  criteria: Record<string, string>;
}

export interface ChoiceAnswer {
  /** The winning option's id. */
  choice: string;
  /** The estimated probability (0–1) that `choice` is right. */
  confidence: number;
}

/** The Decisions API refused the request or could not be reached. */
export class DecisionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecisionsError';
  }
}

interface WireAnswer {
  type?: string;
  choice?: unknown;
  confidence?: unknown;
}

async function request(
  apiKey: string,
  input: string,
  questions: [string, ChoiceQuestion][],
): Promise<Record<string, ChoiceAnswer>> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/decisions`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DECISION_MODEL,
        input,
        questions: Object.fromEntries(
          questions.map(([key, q]) => [key, { type: 'choice', ...q }]),
        ),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // The cause can carry the request, key and all: say only that it failed.
    throw new DecisionsError('Could not reach the Gemini Decisions API');
  }

  const body = (await res.json().catch(() => null)) as {
    answers?: Record<string, WireAnswer>;
    error?: { message?: unknown };
  } | null;
  if (!res.ok || !body?.answers) {
    const detail = typeof body?.error?.message === 'string' ? body.error.message : `HTTP ${res.status}`;
    throw new DecisionsError(`The Gemini Decisions API refused the request: ${detail}`);
  }

  const answers: Record<string, ChoiceAnswer> = {};
  for (const [key, question] of questions) {
    const answer = body.answers[key];
    // An option the question never offered is no answer at all.
    if (typeof answer?.choice !== 'string' || !(answer.choice in question.criteria)) continue;
    answers[key] = {
      choice: answer.choice,
      confidence: typeof answer.confidence === 'number' ? answer.confidence : 0,
    };
  }
  return answers;
}

/**
 * Answer every question against `input` (required by the API; what the
 * questions have in common). Keys are 1–64 characters of `[A-Za-z0-9_-]` and
 * come back on the answers; a question the API gave no usable answer to is
 * left out. Throws {@link DecisionsError} — gate on
 * {@link isDecisionsConfigured} first.
 */
export async function decideChoices(
  input: string,
  questions: Record<string, ChoiceQuestion>,
): Promise<Record<string, ChoiceAnswer>> {
  const apiKey = decisionsKey();
  if (!apiKey) throw new DecisionsError('No Gemini API key is configured');
  const entries = Object.entries(questions);
  const answers: Record<string, ChoiceAnswer> = {};
  for (let i = 0; i < entries.length; i += MAX_QUESTIONS) {
    Object.assign(answers, await request(apiKey, input, entries.slice(i, i + MAX_QUESTIONS)));
  }
  return answers;
}
