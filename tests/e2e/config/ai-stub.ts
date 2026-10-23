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
 */

import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';

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

/**
 * The stub as a fetch handler: the reply for one OpenAI request, after the
 * deliberate delay. The e2e server below serves it over HTTP; the VM test tier
 * (packages/homestead-test-harness) serves it in-process.
 */
export async function aiStubFetch(req: Request): Promise<Response> {
  const payload = payloadForBody(await req.text());
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
        res.writeHead(reply.status, { 'Content-Type': 'application/json' });
        res.end(await reply.text());
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
