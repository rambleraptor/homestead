/**
 * Deterministic keyword fallback for when Gemini isn't available or the
 * LLM returns a low-confidence result. Matches a query against each
 * module's `synonyms` + name/description and returns a `kind: 'list'`
 * intent for the best match.
 *
 * Used in two places:
 *  - `/api/omnibox/parse` when `GEMINI_API_KEY` is unset or the call fails.
 *  - Client-side sanity check on the LLM's confidence score.
 */

import type { ManifestModule } from '@rambleraptor/homestead-core/shared/omnibox/manifest';
import type { OmniboxIntent } from '@rambleraptor/homestead-core/shared/omnibox/types';

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

interface Scored {
  moduleId: string;
  score: number;
}

/**
 * Return the best-matching module for `query`, or null if nothing
 * scores above zero.
 *
 * Scoring (higher = better):
 *  - +3 for each exact-token match against the module's synonyms
 *  - +2 for an exact-token match against the module id
 *  - +1 for a substring match against name/description
 */
export function matchModule(
  query: string,
  manifest: ManifestModule[],
): Scored | null {
  const tokens = new Set(tokenize(query));
  const lowered = query.toLowerCase();

  let best: Scored | null = null;
  for (const m of manifest) {
    let score = 0;
    for (const syn of m.synonyms) {
      if (tokens.has(syn.toLowerCase())) score += 3;
    }
    if (tokens.has(m.moduleId.toLowerCase())) score += 2;
    if (lowered.includes(m.name.toLowerCase())) score += 1;
    if (m.description && lowered.includes(m.description.toLowerCase())) {
      score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { moduleId: m.moduleId, score };
    }
  }
  return best;
}

/**
 * Produce a fallback intent from a raw query. Always `kind: 'list'` with
 * no filters — we don't attempt to parse filter values without the LLM.
 * Returns null when nothing matches.
 */
export function parseFallback(
  query: string,
  manifest: ManifestModule[],
): OmniboxIntent | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const match = matchModule(trimmed, manifest);
  if (!match) return null;
  return {
    kind: 'list',
    moduleId: match.moduleId,
    filters: {},
    confidence: 0.3,
    rationale: 'Matched by keyword (no LLM available).',
  };
}
