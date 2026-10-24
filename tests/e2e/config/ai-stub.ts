/**
 * Stub AI provider for e2e.
 *
 * The e2e server points `AI_BASE_URL` here (provider `openai`), so AI-backed
 * methods (`documents:classify`) run end-to-end without calling a paid model.
 * It speaks just enough of OpenAI's **Responses** API — the shape
 * `@ai-sdk/openai` uses by default — for the AI SDK's `generateObject` to
 * parse a result out of it.
 *
 * Two behaviours the specs rely on:
 *  - a deliberate {@link RESPONSE_DELAY_MS} pause, so the spawned operation
 *    stays `running` long enough for a test to observe the spinner UI. The
 *    delay lives here in the harness — never in product code.
 *  - a request carrying the {@link DOC_MARKERS}.fail marker gets a
 *    schema-violating object back, which makes the real handler throw and the
 *    operation fail for real.
 *
 * **Chat.** A request whose latest user message carries a chat script's marker
 * (`./ai-scripts.ts`) is answered from that script instead: tool calls the
 * agent loop runs, then text. Both of the provider's modes are spoken — a JSON
 * reply for `generateText`, and the Responses event stream for `streamText`
 * (`"stream": true`), whose text arrives a word at a time,
 * {@link chunkDelayMs} apart, so a test can watch it land.
 */

import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
  ATTACHMENT_ID_PLACEHOLDER,
  ATTACHMENTS_PLACEHOLDER,
  SCRIPT_EXHAUSTED_TEXT,
  scriptFor,
  type ScriptStep,
} from './ai-scripts';

/**
 * Long enough to observe "running", short enough to keep tests quick.
 * `AI_STUB_DELAY_MS` overrides it: the VM test tier, which polls every few
 * milliseconds rather than at browser speed, needs far less.
 */
export const RESPONSE_DELAY_MS = 2500;

function responseDelayMs(): number {
  const override = Number(process.env.AI_STUB_DELAY_MS);
  return Number.isFinite(override) && override >= 0 && process.env.AI_STUB_DELAY_MS
    ? override
    : RESPONSE_DELAY_MS;
}

/**
 * Document classify markers.
 *
 * The `documents:classify` method reads the *stored* file and base64s it into
 * the request, so a document spec uploads a file whose bytes are one of these
 * markers and the stub keys on the base64 appearing in the body. Marker-first
 * routing means the stub needs no knowledge of the classify prompt's wording.
 */
export const DOC_MARKERS = {
  match: 'e2e-document-form-1099-int',
  unknown: 'e2e-document-unrecognised',
  fail: 'e2e-document-parse-failure',
} as const;

/**
 * The stub's reply to a `match` document, across both classify passes.
 *
 * Classify makes two structured-output calls: pass 1 reads `title`, `confidence`
 * and `doc_type`; pass 2 reads the matched type's fields. The stub can't tell
 * the passes apart (both carry the same document marker), so this one flat
 * payload serves both — Zod keeps the keys each pass's schema declares and
 * strips the rest. The extraction fields are `.nullable()` (present, but null
 * when not found), so the ones this stub doesn't read are explicit `null`s; the
 * handler's `stripNulls` drops them before storage.
 */
export const STUB_DOCUMENT_1099 = {
  // Pass 1 keys.
  title: '1099-INT (2025) — Ally Bank',
  confidence: 0.95,
  doc_type: 'form-1099-int',
  // Pass 2 keys — the 1099-INT fields.
  payer_name: 'Ally Bank',
  payer_tin: 'XX-XXX6789',
  recipient_name: 'Alex Stephen',
  recipient_tin: null,
  box_1_interest: 412.55,
  box_2_early_withdrawal_penalty: null,
  box_3_savings_bond_interest: null,
  box_4_federal_tax_withheld: 0,
  box_8_tax_exempt_interest: null,
  // The form's `title_template` is `1099-INT ({tax_year}) — {payer_name}`, so the
  // year is a real extracted field the handler renders into the title (2025 here
  // keeps the rendered title matching the pass-1 `title` above).
  tax_year: 2025,
};

/**
 * A genuine "not a known type" read: low confidence, the unknown tag. Only
 * pass 1 runs (an unmatched document skips extraction), so this needs the
 * pass-1 keys alone.
 */
export const STUB_DOCUMENT_UNKNOWN = {
  title: 'Customer letter',
  confidence: 0.15,
  doc_type: 'unknown',
};

/**
 * A schema-violating payload: `doc_type` names no known type, so pass 1's enum
 * rejects it and `generateObject` throws — driving the handler's failure path
 * (parse_status → failed) for real, the document analogue of FAIL_IMAGE.
 */
export const STUB_DOCUMENT_FAIL = {
  confidence: 0.5,
  doc_type: 'not-a-real-document-type',
};

/** Pick the model payload for a request body, marker-first. */
function payloadForBody(body: string): unknown {
  const has = (marker: string) => body.includes(Buffer.from(marker).toString('base64'));
  if (has(DOC_MARKERS.unknown)) return STUB_DOCUMENT_UNKNOWN;
  if (has(DOC_MARKERS.fail)) return STUB_DOCUMENT_FAIL;
  // Default (including the `match` marker) reads as a 1099-INT.
  return STUB_DOCUMENT_1099;
}

let server: Server | null = null;

/**
 * An OpenAI Responses-API reply carrying `payload` as the model's JSON output.
 * Mirrors `openaiResponsesResponseSchema` in @ai-sdk/openai.
 */
function responsesReply(payload: unknown) {
  return {
    id: 'resp-stub',
    created_at: 0,
    model: 'stub-model',
    status: 'completed',
    output: [
      {
        type: 'message',
        role: 'assistant',
        id: 'msg-stub',
        status: 'completed',
        // `annotations` is required by the provider's response schema.
        content: [
          { type: 'output_text', text: JSON.stringify(payload), annotations: [] },
        ],
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

// ─────────────────────────────── scripted chat ───────────────────────────────

/**
 * Pause between streamed chunks. Short by default — long enough that text
 * visibly arrives in pieces, short enough not to slow a suite.
 * `AI_STUB_CHUNK_DELAY_MS` overrides it.
 */
export function chunkDelayMs(): number {
  const override = Number(process.env.AI_STUB_CHUNK_DELAY_MS);
  return process.env.AI_STUB_CHUNK_DELAY_MS && Number.isFinite(override) && override >= 0
    ? override
    : 20;
}

/** One item of a Responses API request's `input`. */
type InputItem = {
  role?: string;
  type?: string;
  content?: string | Array<{ type?: string; text?: string }>;
};

/**
 * What files a user message carried, as the model would see them: images as
 * `input_image` parts, PDFs as `input_file`. Fills a script's
 * {@link ATTACHMENTS_PLACEHOLDER}, so a test can check what reached the model.
 */
function attachmentSummary(item: InputItem): string {
  const parts = Array.isArray(item.content) ? item.content : [];
  const images = parts.filter((p) => p.type === 'input_image').length;
  const pdfs = parts.filter((p) => p.type === 'input_file').length;
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  return `I can see ${plural(images, 'image')} and ${plural(pdfs, 'PDF')}.`;
}

/** The text of an input item's content, however the provider shaped it. */
function textOf(item: InputItem): string {
  if (typeof item.content === 'string') return item.content;
  return (item.content ?? []).map((part) => part.text ?? '').join(' ');
}

/**
 * The scripted step this request asks for, or null when it isn't a chat
 * request carrying a script's marker. See `./ai-scripts.ts` for the rule.
 */
export function scriptedStep(body: unknown): ScriptStep | null {
  const input = (body as { input?: unknown })?.input;
  if (!Array.isArray(input)) return null;
  const items = input as InputItem[];

  let lastUser = -1;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.role === 'user') {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return null;
  const script = scriptFor(textOf(items[lastUser]!));
  if (!script) return null;

  const round = items.slice(lastUser + 1).filter((item) => item.type === 'function_call_output').length;
  let step = script.steps[round] ?? { text: SCRIPT_EXHAUSTED_TEXT };
  if (step.text?.includes(ATTACHMENTS_PLACEHOLDER)) {
    step = { ...step, text: step.text.replace(ATTACHMENTS_PLACEHOLDER, attachmentSummary(items[lastUser]!)) };
  }
  if (step.toolCalls && JSON.stringify(step.toolCalls).includes(ATTACHMENT_ID_PLACEHOLDER)) {
    const id = /attachment id: ([A-Za-z0-9_-]+)/.exec(textOf(items[lastUser]!))?.[1] ?? 'no-attachment';
    step = {
      ...step,
      toolCalls: JSON.parse(JSON.stringify(step.toolCalls).replaceAll(ATTACHMENT_ID_PLACEHOLDER, id)),
    };
  }
  return step;
}

/** Stable ids for a step's output items, so a reply is reproducible. */
function callId(index: number): string {
  return `call_stub_${index}`;
}

/** The step as a non-streaming Responses reply (what `generateText` reads). */
function scriptedReply(step: ScriptStep) {
  const output: unknown[] = (step.toolCalls ?? []).map((call, i) => ({
    type: 'function_call',
    id: `fc_stub_${i}`,
    call_id: callId(i),
    name: call.name,
    arguments: JSON.stringify(call.args),
    status: 'completed',
  }));
  if (step.text !== undefined) {
    output.push({
      type: 'message',
      role: 'assistant',
      id: 'msg-stub',
      status: 'completed',
      content: [{ type: 'output_text', text: step.text, annotations: [] }],
    });
  }
  return {
    id: 'resp-stub',
    created_at: 0,
    model: 'stub-model',
    status: 'completed',
    output,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

/**
 * The step as the Responses event stream (what `streamText` reads): tool calls
 * as added → arguments → done items, then the text a word at a time, then
 * `response.completed`. Only the events the provider parses are sent.
 */
function scriptedStream(step: ScriptStep): Response {
  const encoder = new TextEncoder();
  const delay = chunkDelayMs();
  const events: unknown[] = [
    { type: 'response.created', response: { id: 'resp-stub', created_at: 0, model: 'stub-model' } },
  ];

  let index = 0;
  for (const [i, call] of (step.toolCalls ?? []).entries()) {
    const item = { type: 'function_call', id: `fc_stub_${i}`, call_id: callId(i), name: call.name };
    const args = JSON.stringify(call.args);
    events.push(
      { type: 'response.output_item.added', output_index: index, item: { ...item, arguments: '' } },
      { type: 'response.function_call_arguments.delta', item_id: item.id, output_index: index, delta: args },
      {
        type: 'response.output_item.done',
        output_index: index,
        item: { ...item, arguments: args, status: 'completed' },
      },
    );
    index++;
  }

  if (step.text !== undefined) {
    const message = { type: 'message', id: 'msg-stub' };
    events.push({ type: 'response.output_item.added', output_index: index, item: message });
    // A word at a time, keeping the spaces, so the joined deltas equal the text.
    for (const word of step.text.match(/\S+\s*|\s+/g) ?? []) {
      events.push({ type: 'response.output_text.delta', item_id: message.id, delta: word });
    }
    events.push({ type: 'response.output_item.done', output_index: index, item: message });
  }

  events.push({
    type: 'response.completed',
    response: { usage: { input_tokens: 1, output_tokens: 1 } },
  });

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [n, event] of events.entries()) {
        if (n > 0 && delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

/**
 * The stub as a fetch handler: the reply for one OpenAI request. A scripted
 * chat turn is answered at once (streamed when asked to be); anything else is a
 * document request, answered after the deliberate delay. The e2e server below
 * serves it over HTTP; the VM test tier (packages/homestead-test-harness)
 * serves it in-process.
 */
export async function aiStubFetch(req: Request): Promise<Response> {
  const text = await req.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }

  const step = scriptedStep(parsed);
  if (step) {
    return (parsed as { stream?: boolean }).stream === true
      ? scriptedStream(step)
      : Response.json(scriptedReply(step));
  }

  const payload = payloadForBody(text);
  await new Promise((resolve) => setTimeout(resolve, responseDelayMs()));
  return Response.json(responsesReply(payload));
}

/** Start the stub on an ephemeral port; returns its OpenAI-style base URL. */
export async function startAiStub(): Promise<string> {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      void aiStubFetch(new Request('http://ai-stub/', { method: 'POST', body })).then(async (reply) => {
        res.writeHead(reply.status, {
          'Content-Type': reply.headers.get('content-type') ?? 'application/json',
        });
        // Pipe chunk by chunk so a streamed reply reaches the client as it is
        // produced, not all at once at the end.
        const reader = reply.body?.getReader();
        if (!reader) return res.end();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      });
    });
  });

  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const { port } = server!.address() as AddressInfo;
  return `http://127.0.0.1:${port}/v1`;
}

export async function stopAiStub(): Promise<void> {
  const active = server;
  server = null;
  if (!active) return;
  await new Promise<void>((resolve) => active.close(() => resolve()));
}
