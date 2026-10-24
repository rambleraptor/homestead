/**
 * The AI stub's scripted chat turns, driven through the real AI SDK and OpenAI
 * provider — the same calls chat makes — so the stub's reply shapes are proven
 * against the parser that reads them, in both modes: `generateText` (a JSON
 * reply) and `streamText` (the Responses event stream).
 */

import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, streamText, tool } from 'ai';
import { aiStubFetch, scriptedStep } from '../../../../tests/e2e/config/ai-stub';
import {
  CHAT_MARKERS,
  SCRIPT_EXHAUSTED_TEXT,
} from '../../../../tests/e2e/config/ai-scripts';

const model = createOpenAI({
  apiKey: 'stub',
  baseURL: 'http://ai-stub.test/v1',
  fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
    aiStubFetch(new Request(input, init))) as typeof fetch,
})('stub-model');

/** A stand-in for chat's per-resource `groceries` tool that records its calls. */
function groceriesTool() {
  const calls: Array<Record<string, unknown>> = [];
  const groceries = tool({
    description: 'The grocery list.',
    inputSchema: z.object({
      action: z.string(),
      fields: z.record(z.string(), z.unknown()).optional(),
      filter: z.string().optional(),
      order_by: z.string().optional(),
      limit: z.number().optional(),
    }),
    execute: async (args) => {
      calls.push(args);
      return { result: { id: 'g1', name: 'Milk' } };
    },
  });
  return { calls, tools: { groceries } };
}

describe('scripted chat turns', () => {
  test('generateText: the scripted tool call runs, then the scripted reply ends the turn', async () => {
    const { calls, tools } = groceriesTool();
    const { text, steps } = await generateText({
      model,
      tools,
      stopWhen: stepCountIs(5),
      messages: [{ role: 'user', content: `Add milk please ${CHAT_MARKERS.addMilk}` }],
    });
    expect(calls).toEqual([{ action: 'create', fields: { name: 'Milk' } }]);
    expect(text).toBe('Added milk to the grocery list.');
    expect(steps).toHaveLength(2);
  });

  test('streamText: the same turn streams — tool call first, then text a word at a time', async () => {
    const { calls, tools } = groceriesTool();
    const result = streamText({
      model,
      tools,
      stopWhen: stepCountIs(5),
      messages: [{ role: 'user', content: `What's left? ${CHAT_MARKERS.listUnchecked}` }],
    });
    const chunks: string[] = [];
    for await (const chunk of result.textStream) chunks.push(chunk);

    expect(calls).toEqual([
      { action: 'list', filter: 'checked == false', order_by: 'name', limit: 20 },
    ]);
    expect(chunks.join('')).toBe('Here is what is still on the list.');
    expect(chunks.length).toBeGreaterThan(1);
    expect(await result.finishReason).toBe('stop');
  });

  test('a text-only script streams with no tool call at all', async () => {
    const result = streamText({
      model,
      messages: [{ role: 'user', content: CHAT_MARKERS.hello }],
    });
    const chunks: string[] = [];
    for await (const chunk of result.textStream) chunks.push(chunk);
    expect(chunks).toHaveLength(9); // one chunk per word
    expect(chunks.join('')).toBe('Hello from the scripted assistant. How can I help?');
  });
});

describe('step selection', () => {
  const user = (text: string) => ({ role: 'user', content: [{ type: 'input_text', text }] });
  const toolResult = { type: 'function_call_output', call_id: 'c', output: '{}' };

  test('counts tool results after the latest user message', () => {
    expect(scriptedStep({ input: [user(CHAT_MARKERS.addMilk)] })?.toolCalls?.[0]?.name).toBe(
      'groceries',
    );
    expect(scriptedStep({ input: [user(CHAT_MARKERS.addMilk), toolResult] })?.text).toBe(
      'Added milk to the grocery list.',
    );
  });

  test('a new user message starts the script over, and its marker decides', () => {
    const body = {
      input: [user(CHAT_MARKERS.addMilk), toolResult, user(`now ${CHAT_MARKERS.hello}`)],
    };
    expect(scriptedStep(body)?.text).toBe('Hello from the scripted assistant. How can I help?');
  });

  test('a round past the last step says so, rather than hanging', () => {
    expect(scriptedStep({ input: [user(CHAT_MARKERS.hello), toolResult] })?.text).toBe(
      SCRIPT_EXHAUSTED_TEXT,
    );
  });

  test('a request with no script marker is not a chat turn', () => {
    expect(scriptedStep({ input: [user('just a document')] })).toBeNull();
    expect(scriptedStep({ prompt: 'x' })).toBeNull();
    expect(scriptedStep(undefined)).toBeNull();
  });
});
