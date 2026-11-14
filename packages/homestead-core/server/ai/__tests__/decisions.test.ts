/**
 * The Gemini Decisions client: which key it calls with, what it sends, and
 * what it makes of the reply. `fetch` is stubbed — nothing reaches the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAiConfig } from '../config';
import {
  decideChoices,
  DecisionsError,
  isDecisionsConfigured,
  MAX_QUESTIONS,
  usesAiKeyForDecisions,
} from '../decisions';

const CRITERIA = { produce: 'Fruit and vegetables.', other: '' };
const question = (item: string) => ({ instructions: `Where is ${item}?`, criteria: CRITERIA });

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function stubFetch(reply: (body: { questions: Record<string, unknown> }) => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (...[, init]: FetchArgs) =>
    reply(JSON.parse(String(init?.body))),
  );
}

const answerAll = (choice: string) => (body: { questions: Record<string, unknown> }) =>
  Response.json({
    answers: Object.fromEntries(
      Object.keys(body.questions).map((key) => [key, { type: 'choice', choice, confidence: 0.9 }]),
    ),
  });

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
  vi.stubEnv('GEMINI_DECISIONS_BASE_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setAiConfig(null);
});

describe('the key', () => {
  it('is unconfigured with no Gemini key and no Google AI key', () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(isDecisionsConfigured()).toBe(false);
    setAiConfig({ provider: 'openai', model: 'm', auth: { apiKey: 'openai-key' } });
    expect(isDecisionsConfigured()).toBe(false);
  });

  it("falls back to the AI key when the provider is Google's own endpoint", async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    setAiConfig({ provider: 'google', model: 'm', auth: { apiKey: 'google-ai-key' } });
    expect(usesAiKeyForDecisions()).toBe(true);
    const fetchSpy = stubFetch(answerAll('produce'));
    await decideChoices('A list.', { a: question('apples') });
    expect(new Headers(fetchSpy.mock.calls[0][1]?.headers).get('x-goog-api-key')).toBe('google-ai-key');
  });

  it("never sends a proxy's key to Google", () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    setAiConfig({ provider: 'google', model: 'm', baseURL: 'http://proxy.test', auth: { apiKey: 'proxy-key' } });
    expect(usesAiKeyForDecisions()).toBe(false);
    expect(isDecisionsConfigured()).toBe(false);
  });
});

describe('decideChoices', () => {
  it('posts choice questions and returns each answer under its key', async () => {
    const fetchSpy = stubFetch(answerAll('produce'));
    const answers = await decideChoices('A list.', { a: question('apples'), b: question('pears') });

    expect(answers).toEqual({
      a: { choice: 'produce', confidence: 0.9 },
      b: { choice: 'produce', confidence: 0.9 },
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/decisions');
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('gemini-key');
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'gemini-decision-1',
      input: 'A list.',
      questions: {
        a: { type: 'choice', instructions: 'Where is apples?', criteria: CRITERIA },
        b: { type: 'choice', instructions: 'Where is pears?', criteria: CRITERIA },
      },
    });
  });

  it('leaves out an answer that names an option the question never offered', async () => {
    stubFetch(answerAll('toys'));
    expect(await decideChoices('A list.', { a: question('apples') })).toEqual({});
  });

  it('splits more questions than one request takes', async () => {
    const fetchSpy = stubFetch(answerAll('other'));
    const questions = Object.fromEntries(
      Array.from({ length: MAX_QUESTIONS + 1 }, (_, i) => [`i${i}`, question('x')]),
    );
    const answers = await decideChoices('A list.', questions);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(Object.keys(answers)).toHaveLength(MAX_QUESTIONS + 1);
  });

  it("reports the API's own message when it refuses", async () => {
    stubFetch(() => Response.json({ error: { code: 'safety', message: 'Request blocked.' } }, { status: 400 }));
    await expect(decideChoices('A list.', { a: question('apples') })).rejects.toThrow(
      /refused the request: Request blocked\./,
    );
  });

  it('says only that it failed when the request cannot be made', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED with gemini-key'));
    const err = await decideChoices('A list.', { a: question('apples') }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DecisionsError);
    expect((err as Error).message).not.toContain('gemini-key');
  });
});
