/**
 * Schema → form plumbing: label humanization, widget inference, initial-value
 * derivation, ordering, and building the submit payload.
 */

import type { FieldDef } from '../../resources/types';
import { isSecretDescriptor } from '../../resources/secrets';
import type { FieldConfig, WidgetName } from './types';

/** `annual_fee` → `Annual Fee`. */
export function humanize(name: string): string {
  return name
    .split('_')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/** The label shown for a field: explicit override, else the schema's display
 *  name, else a humanized field name. */
export function fieldLabel(name: string, field: FieldDef, config?: FieldConfig): string {
  return config?.label ?? field.singular_name ?? humanize(name);
}

/**
 * Pick the default built-in widget for a field from its schema shape. An
 * explicit `config.widget` (string or component) wins before this is consulted.
 */
export function inferWidget(field: FieldDef): WidgetName {
  if (field.secret) return 'secret';
  if (field.reference) return 'reference';
  if (field.type === 'array' && field.items?.reference) return 'reference-multi';
  if (field.enum) return 'select';
  if (field.type === 'file') return 'file';
  if (field.type === 'boolean') return 'checkbox';
  if (field.type === 'array' && field.items?.type === 'string') return 'tags';
  if (field.type === 'number' || field.type === 'integer') return 'number';
  if (field.type === 'string' && (field.format === 'date' || field.format === 'date-time')) {
    return 'date';
  }
  return 'text';
}

/** The resolved widget *name* (custom components resolve to `'__custom__'`). */
export function resolvedWidgetName(field: FieldDef, config?: FieldConfig): WidgetName | '__custom__' {
  if (typeof config?.widget === 'function') return '__custom__';
  if (typeof config?.widget === 'string') return config.widget;
  return inferWidget(field);
}

/** Fields the form never renders by default: audit/ownership pointers to the
 *  built-in user root, fields on their way out, and secrets that aren't text
 *  (structured secrets — OAuth tokens — are the server's to write). */
export function isAutoHidden(field: FieldDef): boolean {
  if (field.deprecated) return true;
  if (field.secret && field.type !== 'string') return true;
  if (field.reference?.resource === 'user') return true;
  return false;
}

function asNumberOrEmpty(v: unknown): number | '' {
  return typeof v === 'number' && Number.isFinite(v) ? v : '';
}

/** The initial state value for a field, before user edits. */
export function initialValue(
  name: string,
  field: FieldDef,
  config: FieldConfig | undefined,
  initialData: Record<string, unknown> | null | undefined,
): unknown {
  const provided = initialData?.[name];
  const fallback = config?.default ?? field.default;
  const widget = resolvedWidgetName(field, config);

  // A file field's form value is the newly-chosen File (or null) — never the
  // stored filename/marker string on the entity. Custom file widgets resolve
  // the existing file separately (e.g. from `config.data`).
  if (field.type === 'file') return null;

  // A secret's form value is its stored descriptor (unchanged), a new value,
  // or null (clear) — see the `secret` widget. Never a default.
  if (field.secret) return isSecretDescriptor(provided) && provided.set ? provided : '';

  // Any array field holds an array — never stringify it. Covers array-of-string
  // (tags/reference-multi) and array-of-object (nested rows / custom editors).
  if (field.type === 'array') {
    return Array.isArray(provided) ? provided : Array.isArray(fallback) ? fallback : [];
  }

  switch (widget) {
    case 'checkbox':
      return typeof provided === 'boolean' ? provided : (fallback ?? false);
    case 'number':
    case 'currency':
      return provided !== undefined ? asNumberOrEmpty(provided) : asNumberOrEmpty(fallback);
    case 'date':
      return typeof provided === 'string'
        ? provided.split('T')[0]
        : typeof fallback === 'string'
          ? fallback
          : '';
    case 'tags':
    case 'reference-multi':
      return Array.isArray(provided) ? provided : [];
    default:
      if (provided !== undefined && provided !== null) return String(provided);
      return fallback !== undefined && fallback !== null ? String(fallback) : '';
  }
}

/**
 * Order fields for display: an explicit `layout.order` wins; otherwise by
 * per-field `order`, falling back to schema declaration order.
 */
export function orderFields(
  names: string[],
  configs: Partial<Record<string, FieldConfig>>,
  layoutOrder?: string[],
): string[] {
  if (layoutOrder && layoutOrder.length > 0) {
    const set = new Set(layoutOrder);
    return [...layoutOrder.filter((n) => names.includes(n)), ...names.filter((n) => !set.has(n))];
  }
  return [...names].sort((a, b) => {
    const oa = configs[a]?.order ?? names.indexOf(a);
    const ob = configs[b]?.order ?? names.indexOf(b);
    return oa - ob;
  });
}

/**
 * Build the payload handed to `onSubmit`. Required fields are always sent
 * (empty numerics coerced to 0); optional fields are omitted when blank so a
 * pattern/enum constraint never trips on an empty string. Booleans always send.
 */
export function buildPayload(
  visible: { name: string; field: FieldDef; config?: FieldConfig }[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { name, field, config } of visible) {
    const required = !!field.required;
    let v = values[name];
    const widget = resolvedWidgetName(field, config);

    if (field.secret) {
      // A new value sets it (untrimmed: it's someone's key), null clears it;
      // the stored descriptor or an empty box leaves it alone.
      if (v === null) out[name] = null;
      else if (typeof v === 'string' && v !== '') out[name] = v;
      continue;
    }
    if (widget === 'number' || widget === 'currency') {
      if (v === '' || v === undefined) {
        if (required) out[name] = 0;
        continue;
      }
      out[name] = v;
      continue;
    }
    if (typeof v === 'boolean') {
      out[name] = v;
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length > 0 || required) out[name] = v;
      continue;
    }
    if (typeof v === 'string') {
      v = v.trim();
      if (v !== '' || required) out[name] = v;
      continue;
    }
    if (v !== undefined && v !== null) out[name] = v;
  }
  return out;
}
