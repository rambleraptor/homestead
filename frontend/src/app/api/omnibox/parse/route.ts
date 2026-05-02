/**
 * POST /api/omnibox/parse
 * Body: { query: string }
 * Returns: { intent: OmniboxIntent | null, fallback: boolean, message?: string }
 *
 * Access is gated by the `settings.omnibox_access` module setting:
 * superusers always pass; other users only when it is `'all'`.
 * Parses a natural-language query into a structured intent the client
 * dispatcher can route to a module. Uses Gemini when `GEMINI_API_KEY`
 * is set, falls back to keyword matching otherwise.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { aepList, authenticate } from '../../_lib/aepbase-server';
import { buildManifest } from '@rambleraptor/homestead-core/shared/omnibox/manifest';
import { parseFallback } from '@rambleraptor/homestead-core/shared/omnibox/parseFallback';
import { fieldName } from '@rambleraptor/homestead-core/settings/flags';
import type {
  OmniboxIntent,
  OmniboxParseResponse,
} from '@rambleraptor/homestead-core/shared/omnibox/types';

const MIN_CONFIDENCE = 0.5;

const SYSTEM_PROMPT = `You are the intent parser for a household management app called Homestead.
You receive a natural-language query and a manifest of modules the app
exposes. Each module has synonyms, optional filters, and an optional set
of forms.

Your job: return a JSON object describing what the user wants. Always
pick the single best match.

Possible outputs (match one of these shapes exactly):

  { "kind": "list", "moduleId": "<id>", "filters": { ... },
    "confidence": 0.0-1.0, "rationale": "<short phrase>" }

  { "kind": "form", "moduleId": "<id>", "formId": "<id>",
    "formPrefill": { ... }, "confidence": 0.0-1.0,
    "rationale": "<short phrase>" }

About filters (IMPORTANT):
Filters narrow a list to the records the user is actually asking about.
A query almost never wants the whole collection — when it mentions a
specific name, label, status, date, or attribute, lift that value into
"filters". Proper nouns in the query ("Emily", "Chase Sapphire") are
filter values, not just routing hints; do not drop them.

Only use keys declared under that module's "filters", and supply values
that match each filter's declared "type":
  - "text": a substring the record's field should contain. Pass the
    raw value as a string; the app does case-insensitive substring
    matching. Example: name="Emily" matches "Emily Smith".
  - "enum": exactly one of the declared "values".
  - "boolean": true or false.
  - "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } —
    either side may be omitted.

Leave "filters" empty only when the query explicitly asks for
everything ("show me all people", "list every gift card"). A question
like "what is X's Y" or "where does X live" wants a filter on X.

Examples:
- "what is Emily's address" →
    { "kind": "list", "moduleId": "people",
      "filters": { "name": "Emily" }, "confidence": 0.9,
      "rationale": "Looking up a person by name" }
- "when is Jordan's birthday" →
    { "kind": "list", "moduleId": "people",
      "filters": { "name": "Jordan" }, "confidence": 0.9,
      "rationale": "Looking up a person by name" }
- "show me all people" →
    { "kind": "list", "moduleId": "people",
      "filters": {}, "confidence": 0.9, "rationale": "All people" }
- "add milk to groceries" →
    { "kind": "form", "moduleId": "groceries", "formId": "create-grocery",
      "formPrefill": { "name": "milk" }, "confidence": 0.9,
      "rationale": "Adding a grocery item" }

Rules:
- Use a module's synonyms to route the query.
- For a form, only use a formId declared under that module's "forms",
  and only include keys that exist in its paramSchema.properties.
- If the query is a read-style question ("show me", "what", "who",
  "where", "when", "find", "list"), prefer kind=list.
- If the query is an action ("add", "create", "new", "delete"), prefer
  kind=form.
- If you are not sure, return kind=list with a lower confidence.
- Keep "rationale" under 80 characters.`;

interface PromptPayload {
  query: string;
  manifest: unknown;
}

async function callGemini(
  apiKey: string,
  payload: PromptPayload,
): Promise<OmniboxIntent | null> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0,
    },
  });

  const prompt = [
    SYSTEM_PROMPT,
    '',
    'MODULE MANIFEST:',
    JSON.stringify(payload.manifest, null, 2),
    '',
    'USER QUERY:',
    payload.query,
  ].join('\n');

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const match = text.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!isValidIntent(parsed)) return null;
  return parsed;
}

/**
 * Consult the household's module-flags singleton and return true if
 * omnibox access has been opened up to all users. Returns false on any
 * failure (missing resource, empty singleton, network error) — the
 * default policy stays superuser-only.
 */
async function omniboxAllowedForAll(token: string): Promise<boolean> {
  try {
    const records = await aepList<Record<string, unknown>>(
      'module-flags',
      token,
    );
    if (records.length === 0) return false;
    const value = records[0][fieldName('settings', 'omnibox_access')];
    return value === 'all';
  } catch {
    return false;
  }
}

function isValidIntent(value: unknown): value is OmniboxIntent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.moduleId !== 'string') return false;
  if (typeof v.confidence !== 'number') return false;
  if (v.kind === 'list') return true;
  if (v.kind === 'form' && typeof v.formId === 'string') return true;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized - authentication required' },
        { status: 401 },
      );
    }
    if (auth.user.type !== 'superuser') {
      const allowed = await omniboxAllowedForAll(auth.token);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Forbidden - omnibox access is restricted to superusers' },
          { status: 403 },
        );
      }
    }

    const body = (await request.json().catch(() => null)) as
      | { query?: unknown }
      | null;
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query) {
      return NextResponse.json(
        { error: 'Bad request', message: 'Missing query' },
        { status: 400 },
      );
    }

    const manifest = buildManifest();

    // Try Gemini first when the key is available.
    const apiKey = process.env.GEMINI_API_KEY;
    let intent: OmniboxIntent | null = null;
    let usedFallback = false;

    if (apiKey) {
      try {
        intent = await callGemini(apiKey, { query, manifest });
      } catch (err) {
        // Intentionally swallow and fall through to keyword matching;
        // the user still gets a useful result.
        console.error('Gemini call failed, using fallback', err);
        intent = null;
      }
    }

    if (!intent || intent.confidence < MIN_CONFIDENCE) {
      intent = parseFallback(query, manifest);
      usedFallback = true;
    }

    const response: OmniboxParseResponse = {
      intent,
      fallback: usedFallback,
      message: intent ? undefined : 'No matching module for that query.',
    };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
