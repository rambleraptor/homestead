/** Field validation — port of pkg/resource/validate.go. */

import type { Schema } from './types';
import { STANDARD_FIELDS } from './types';
import { isSystemWrite } from './request-context';

export function validateRequired(
  schema: Schema,
  fields: Record<string, unknown>,
): string | null {
  return validateRequiredWithFiles(schema, fields, new Set(), new Set());
}

/** Required-field check; file fields count as present when uploaded. */
export function validateRequiredWithFiles(
  schema: Schema,
  fields: Record<string, unknown>,
  fileFields: Set<string>,
  uploaded: Set<string>,
): string | null {
  const missing: string[] = [];
  for (const name of schema.required ?? []) {
    if (STANDARD_FIELDS.has(name)) continue;
    if (fileFields.has(name)) {
      if (!uploaded.has(name)) missing.push(name);
      continue;
    }
    if (!(name in fields)) missing.push(name);
  }
  return missing.length > 0 ? `missing required fields: ${missing.join(', ')}` : null;
}

export function validateTypes(
  schema: Schema,
  fields: Record<string, unknown>,
  skip: Set<string> = new Set(),
): string | null {
  for (const [name, val] of Object.entries(fields)) {
    if (STANDARD_FIELDS.has(name) || skip.has(name)) continue;
    const prop = schema.properties?.[name];
    if (!prop) continue; // unknown fields are ignored (not in schema)
    if (val === null || val === undefined) continue; // null clears any type
    const err = checkType(name, val, prop.type);
    if (err) return err;
  }
  return null;
}

function checkType(name: string, val: unknown, expectedType?: string): string | null {
  switch (expectedType) {
    case 'string':
      if (typeof val !== 'string') return `field "${name}" must be a string`;
      break;
    case 'integer':
      if (typeof val !== 'number' || !Number.isInteger(val)) {
        return `field "${name}" must be an integer`;
      }
      break;
    case 'number':
      if (typeof val !== 'number') return `field "${name}" must be a number`;
      break;
    case 'boolean':
      if (typeof val !== 'boolean') return `field "${name}" must be a boolean`;
      break;
    case 'array':
      if (!Array.isArray(val)) return `field "${name}" must be an array`;
      break;
    case 'object':
      if (typeof val !== 'object' || val === null || Array.isArray(val)) {
        return `field "${name}" must be an object`;
      }
      break;
  }
  return null;
}

/**
 * Assertion-keyword check: enforce the standard JSON-schema numeric/string/array
 * constraints (`minimum`, `maxLength`, `pattern`, `minItems`, …) a field's schema
 * declares. Runs after {@link validateTypes}, so a value reaching here already
 * matches its declared type. Array-item constraints are checked one level deep
 * against the array's `items` schema. Returns the first violation, or null.
 */
export function validateConstraints(
  schema: Schema,
  fields: Record<string, unknown>,
  skip: Set<string> = new Set(),
): string | null {
  for (const [name, val] of Object.entries(fields)) {
    if (STANDARD_FIELDS.has(name) || skip.has(name)) continue;
    const prop = schema.properties?.[name];
    if (!prop) continue; // unknown fields are ignored (not in schema)
    if (val === null || val === undefined) continue; // null clears; nothing to check
    const err = checkConstraints(name, val, prop);
    if (err) return err;
  }
  return null;
}

function checkConstraints(
  name: string,
  val: unknown,
  prop: { [k: string]: unknown; items?: unknown },
): string | null {
  if (typeof val === 'number') {
    if (typeof prop.minimum === 'number' && val < prop.minimum) {
      return `field "${name}" must be >= ${prop.minimum}`;
    }
    if (typeof prop.maximum === 'number' && val > prop.maximum) {
      return `field "${name}" must be <= ${prop.maximum}`;
    }
    if (typeof prop.exclusiveMinimum === 'number' && val <= prop.exclusiveMinimum) {
      return `field "${name}" must be > ${prop.exclusiveMinimum}`;
    }
    if (typeof prop.exclusiveMaximum === 'number' && val >= prop.exclusiveMaximum) {
      return `field "${name}" must be < ${prop.exclusiveMaximum}`;
    }
    if (
      typeof prop.multipleOf === 'number' &&
      prop.multipleOf > 0 &&
      !isMultipleOf(val, prop.multipleOf)
    ) {
      return `field "${name}" must be a multiple of ${prop.multipleOf}`;
    }
  }

  if (typeof val === 'string') {
    const len = [...val].length; // count Unicode code points, per JSON Schema
    if (typeof prop.minLength === 'number' && len < prop.minLength) {
      return `field "${name}" must be at least ${prop.minLength} characters`;
    }
    if (typeof prop.maxLength === 'number' && len > prop.maxLength) {
      return `field "${name}" must be at most ${prop.maxLength} characters`;
    }
    if (typeof prop.pattern === 'string' && !safeMatches(prop.pattern, val)) {
      return `field "${name}" must match pattern ${prop.pattern}`;
    }
  }

  if (Array.isArray(val)) {
    if (typeof prop.minItems === 'number' && val.length < prop.minItems) {
      return `field "${name}" must have at least ${prop.minItems} items`;
    }
    if (typeof prop.maxItems === 'number' && val.length > prop.maxItems) {
      return `field "${name}" must have at most ${prop.maxItems} items`;
    }
    if (prop.uniqueItems === true && hasDuplicates(val)) {
      return `field "${name}" items must be unique`;
    }
    const items = prop.items as { [k: string]: unknown; items?: unknown } | undefined;
    if (items) {
      for (const el of val) {
        if (el === null || el === undefined) continue;
        const err = checkConstraints(name, el, items);
        if (err) return err;
      }
    }
  }

  return null;
}

/** Float-safe multiple check: `val / factor` must be (near) integral. */
function isMultipleOf(val: number, factor: number): boolean {
  const ratio = val / factor;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

/** Test a pattern; an uncompilable pattern (rejected at boot) never blocks a write. */
function safeMatches(pattern: string, val: string): boolean {
  try {
    return new RegExp(pattern).test(val);
  } catch {
    return true;
  }
}

function hasDuplicates(arr: unknown[]): boolean {
  const seen = new Set<string>();
  for (const el of arr) {
    const key = typeof el === 'string' ? `s:${el}` : JSON.stringify(el);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/** Enum check: constrained fields must hold one of the allowed strings. */
export function validateEnums(
  enums: Record<string, string[]> | undefined,
  fields: Record<string, unknown>,
): string | null {
  if (!enums || Object.keys(enums).length === 0) return null;
  for (const [name, val] of Object.entries(fields)) {
    if (val === null || val === undefined) continue;
    const allowed = enums[name];
    if (!allowed || allowed.length === 0) continue;
    if (typeof val !== 'string' || !allowed.includes(val)) {
      return `field "${name}" must be one of ${allowed.join(', ')}`;
    }
  }
  return null;
}

/**
 * Fill in schema-declared `default` values for fields absent from a create
 * (or an apply that creates a new resource) payload, in place. Standard,
 * readOnly, and file
 * fields never receive defaults; non-primitive defaults are deep-cloned so
 * records don't share mutable references.
 */
export function applyDefaults(schema: Schema, fields: Record<string, unknown>): void {
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    if (prop.default === undefined) continue;
    if (STANDARD_FIELDS.has(name) || prop.readOnly) continue;
    if (prop['x-aepbase-file-field']) continue;
    if (name in fields) continue;
    fields[name] = cloneDefault(prop.default);
  }
}

function cloneDefault(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Remove readOnly-marked fields from a client payload, in place. A system
 * field (`x-aepbase-system`) is kept when the write is a system write — server
 * code inside `runAsSystemWrite`.
 */
export function stripReadOnlyFields(schema: Schema, fields: Record<string, unknown>): void {
  const system = isSystemWrite();
  for (const name of Object.keys(fields)) {
    if (STANDARD_FIELDS.has(name)) continue;
    const prop = schema.properties?.[name];
    if (prop?.readOnly && !(system && prop['x-aepbase-system'])) {
      delete fields[name];
    }
  }
}

/**
 * The immutable fields a payload carries, if any.
 *
 * A field marked `x-aepbase-immutable` (from a `FieldDef`'s `immutable`) is
 * settable at create and refused afterwards. Unlike {@link stripReadOnlyFields},
 * this **reports** rather than deletes: silently dropping the key would leave a
 * caller believing it changed something. That matters most for the chat tools,
 * whose `update_<resource>` parameters are derived from the schema's fields, so
 * a model is offered the field and would take a no-op for success.
 *
 * Callers use it on update and full-replace-onto-an-existing-record only —
 * never on create, which is the one write that may set these fields.
 */
export function immutableFieldsIn(
  schema: Schema,
  fields: Record<string, unknown>,
): string[] {
  const found: string[] = [];
  for (const name of Object.keys(fields)) {
    if (STANDARD_FIELDS.has(name)) continue;
    if (schema.properties?.[name]?.['x-aepbase-immutable']) found.push(name);
  }
  return found;
}

/** The 400 message for an update that carries immutable fields. */
export function immutableFieldsError(names: string[]): string {
  const plural = names.length === 1 ? 'field' : 'fields';
  return `cannot modify immutable ${plural}: ${names.join(', ')}`;
}
