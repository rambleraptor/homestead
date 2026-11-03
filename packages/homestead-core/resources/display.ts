/**
 * How a resource and its records are named for people, where nothing else
 * says: a tool call in an assistant reply, a search hit, a change toast.
 * Runtime-free, shared by the server and the SPA.
 */

import type { ResourceDefinition } from './types';

/** `gift-card` → `Gift card`; `gift-cards` → `Gift cards`. */
export function resourceLabel(
  def: Pick<ResourceDefinition, 'singular' | 'plural'>,
  form: 'singular' | 'plural' = 'singular',
): string {
  const words = def[form].split('-').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The fields tried, in order, for a record's title. */
export const TITLE_FIELDS: readonly string[] = ['title', 'name', 'merchant', 'display_name', 'email'];

/**
 * A record's display title, if it has one: `title`, then `name`, then the
 * fields other resources use for the same job. A `name` that is an AEP
 * resource name (`people/abc`) reads as its last segment. Users carry neither,
 * so they fall back to their display name, then email.
 */
export function recordTitle(record: unknown): string | undefined {
  if (!record || typeof record !== 'object') return undefined;
  const r = record as Record<string, unknown>;
  for (const field of TITLE_FIELDS) {
    const value = r[field];
    if (typeof value !== 'string' || !value) continue;
    return field === 'name' ? value.split('/').filter(Boolean).pop() : value;
  }
  return undefined;
}
