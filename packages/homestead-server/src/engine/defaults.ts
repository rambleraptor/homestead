/**
 * Dynamic field defaults: values sourced from another collection's field, and
 * `stamp: 'create'` times.
 *
 * A field annotated `defaultFromFlag: { app, key }` in an app's schema is
 * translated to an `x-aepbase-default-from` marker on its wire property (see
 * `homestead-core/resources/translate.ts`). The marker names a source
 * collection (the household `app-flags` singleton) and a column on it. When a
 * create / full-replace request omits the field, this module reads that column
 * off the collection's single row and fills the field in.
 *
 * This is what lets the "default grocery store" reach *every* write path — the
 * chat CRUD tools, cron hooks, image import, the UI — rather than only the one
 * form that reads the flag client-side: the default is resolved server-side, in
 * the engine, on the create itself.
 */

import type { Registry } from './registry';
import type { Schema, SchemaProperty } from './types';
import { STANDARD_FIELDS } from './types';
import { listResources } from './store';
import { nowRFC3339 } from './ids';

/** The default-from marker on a property, if it declares a valid one. */
function defaultFromMarker(
  prop: SchemaProperty | undefined,
): { resource: string; field: string } | null {
  const marker = prop?.['x-aepbase-default-from'];
  if (!marker || typeof marker !== 'object') return null;
  const { resource, field } = marker as { resource?: unknown; field?: unknown };
  if (typeof resource !== 'string' || !resource) return null;
  if (typeof field !== 'string' || !field) return null;
  return { resource, field };
}

/** Read `column` off the first row of collection `plural`, or undefined. */
function readSourceValue(reg: Registry, plural: string, column: string): unknown {
  const source = reg.all().find((r) => r.plural === plural);
  if (!source) return undefined;
  const { results } = listResources(reg.db, plural, {}, source.schema, 1, '', 0, '');
  const row = results[0];
  return row ? row.fields[column] : undefined;
}

/**
 * Fill fields whose default is sourced from another collection's field
 * (an `app-flags` singleton column) for a create / full-replace payload, in
 * place. Runs after {@link applyDefaults} — static defaults win if both somehow
 * apply, though the translator forbids declaring both on one field. A field
 * already present in the payload (including an explicit empty string) is left
 * alone, and a blank / missing source value is skipped so "no default
 * configured" stays no default.
 */
export function applyDynamicDefaults(
  reg: Registry,
  schema: Schema,
  fields: Record<string, unknown>,
): void {
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    if (STANDARD_FIELDS.has(name) || prop.readOnly) continue;
    if (prop['x-aepbase-file-field']) continue;
    if (name in fields) continue;
    // A `stamp: 'create'` field the caller left out: the time of this write.
    // The SPA fills it itself, with the device's clock, so a record made
    // offline keeps the time it was made.
    if (prop['x-aepbase-stamp'] === 'create') {
      fields[name] = nowRFC3339();
      continue;
    }
    const marker = defaultFromMarker(prop);
    if (!marker) continue;
    const value = readSourceValue(reg, marker.resource, marker.field);
    if (value === undefined || value === null || value === '') continue;
    fields[name] = value;
  }
}
