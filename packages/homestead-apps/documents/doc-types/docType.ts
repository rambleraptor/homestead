/**
 * The document-type contract: validate a doc type and compile it into the
 * shapes the rest of the app needs.
 *
 * One TypeScript module (`export default` a {@link DocType}) is the single
 * source of truth for a document type. It drives:
 *   - the resource schema     (`toVariants`        → FieldDef variants → oneOf)
 *   - the AI classification    (`docTypeIds`        → a Zod enum of ids)
 *   - the AI field extraction  (`toExtractionSchema` → a per-type Zod object)
 *   - the UI labels           (`DocType.fields[].label`)
 *   - the index-row icon      (`DocType.icon`)
 *
 * The built-in types are a static list (`builtins.ts`), so `validateDocType` is
 * a test-time guard for the invariants the type system can't express
 * (kebab-case id, snake_case fields, the reserved `unknown` id) rather than a
 * boot-time loader.
 */

import { z } from 'zod';
import type {
  CustomMethodAuth,
  FieldDef,
} from '@rambleraptor/homestead-core/resources/types';
import type { LazyIcon } from '@rambleraptor/homestead-core/apps/types';
import type { Document } from '../types';

/**
 * Field types a doc type may declare. `string`/`number` are the scalar leaves
 * the model extracts directly; `array`/`object` compose them so a type can
 * pull a structured value (a list of ingredients, a nested record) in the same
 * classify pass. An `array` must declare `items`, an `object` its `properties`.
 */
export type DocFieldType = 'string' | 'number' | 'array' | 'object';

export interface DocField {
  /** Human-readable name, shown in the UI. */
  label: string;
  type: DocFieldType;
  /** Handed to the model verbatim; the main lever on extraction quality. */
  description?: string;
  /** Element type for an `array` field. Required when `type` is `array`. */
  items?: DocField;
  /** Nested fields for an `object` field. Required when `type` is `object`. */
  properties?: Record<string, DocField>;
  /**
   * Marks a `string` field (or, on an array's `items`, each element) as holding
   * a person's name — a patient, a covered driver, a tax-form recipient. It's a
   * UI-only annotation: the documents index reads it to build the generic
   * "filter by person" facet from whatever a document already extracted, so a
   * new person-bearing doc type joins the filter with no code change. Never
   * emitted to the wire schema or the Zod extraction shape — the names live in
   * the type's own metadata columns, not a stored people list.
   */
  person?: boolean;
}

/**
 * Context handed to a {@link PostClassifyHandler} — the persisted, classified
 * document and the metadata the model extracted for it, plus the caller's auth
 * so the hook can create/read related resources over loopback as that user.
 */
export interface PostClassifyContext {
  /** The document as it stands after classify persisted the match. */
  document: Document;
  /** Extracted fields (nulls stripped), including the `doc_type` discriminator. */
  metadata: Record<string, unknown>;
  /** The classify caller — forward `auth.token` to the aepbase helpers. */
  auth: CustomMethodAuth;
}

export interface PostClassifyResult {
  /**
   * Path of the resource the hook created, e.g. `hsa-receipts/abc`. Stored on
   * the document as `linked_resource`; its presence also guards against a
   * re-run creating a duplicate.
   */
  linked_resource?: string;
}

/**
 * A doc type's post-classify hook: runs server-side after a document matches
 * this type. Returns the created resource's path (recorded on the document) or
 * nothing.
 */
export type PostClassifyHandler = (
  ctx: PostClassifyContext,
) => Promise<PostClassifyResult | void>;

export interface DocType {
  /** Kebab-case, globally unique. Becomes the discriminator value. */
  id: string;
  label: string;
  /** What the document *is* — the model's basis for classifying. */
  description: string;
  /**
   * A lazily-loaded Lucide icon, shown on the index row in place of the
   * "Parsed" badge once a document matches this type. Same shape as an app's
   * `web.icon`, e.g. `() => import('lucide-react').then((m) => m.Landmark)`.
   */
  icon: LazyIcon;
  /**
   * Optional category grouping related types, e.g. `'tax'` on every tax form.
   * Unlike a field, it describes the *type* itself (not a value the model
   * extracts), so it's fixed at authoring time — the taxonomy every tax form
   * shares one label. Lowercase kebab-case, from a small shared vocabulary.
   */
  category?: string;
  fields: Record<string, DocField>;
  /**
   * Optional per-type title shape for `classify` to fill, e.g.
   * `'1099-INT ({tax_year}) — {payer_name}'`. Each `{placeholder}` is a
   * snake_case name resolved when a document matches this type:
   *   - a name matching one of this type's `fields` is filled deterministically
   *     from the value that field extracted (a "field-backed" placeholder);
   *   - any other name is a "free" placeholder the model reads off the document
   *     during the extraction pass (e.g. `{tax_year}` on a form that has no
   *     tax-year field) — the hybrid escape hatch for values worth putting in a
   *     title but not worth storing as a column.
   * If every placeholder resolves to a value the rendered string becomes the
   * document's title; if any is missing (a field came back null, or the model
   * couldn't read a free one) `classify` falls back to the model-authored title
   * rather than emitting one with a hole in it. Omit it entirely to always use
   * the model-authored title — the `recipe` type does, because its title is the
   * dish name the model infers, not a value it extracts. See `methods/classify.ts`.
   */
  title_template?: string;
  /**
   * Optional server-only hook run after a document matches this type. Lazily
   * imported (mirrors `ResourceCustomMethod.load`) so its server-only body —
   * aepbase helpers, cross-app imports — stays out of the client bundle. See
   * `methods/classify.ts` for where it fires.
   */
  post_classify?: () => Promise<{ default: PostClassifyHandler }>;
}

/**
 * The discriminator value for a document matching no known type.
 *
 * A real member of the union rather than an absent value, so the model always
 * has a well-formed option to return and `z.discriminatedUnion` stays total.
 * `parse_status` still records the outcome; this only names the shape.
 */
export const UNKNOWN_DOC_TYPE = 'unknown';

/** A label/value pair read off a document that matched no type. */
export interface DocFact {
  label: string;
  value: string;
}

/**
 * The fields an unmatched document carries. With no type to say which fields
 * exist, the model reads the facts worth finding later — a model number, a
 * paint code, an expiry date — as free-form label/value pairs, so a photo of
 * anything still becomes searchable fields rather than just text. Declared as
 * the `unknown` variant's fields, so it flows through the same schema, search,
 * and display paths as a real type's.
 */
export const UNKNOWN_FIELDS: Record<string, DocField> = {
  facts: {
    label: 'Details',
    type: 'array',
    description:
      'The facts a person would want to look up later, as label/value pairs, ' +
      'most useful first. Empty when the document shows none.',
    items: {
      label: 'Detail',
      type: 'object',
      properties: {
        label: {
          label: 'Label',
          type: 'string',
          description:
            'A short name for the fact in Title Case (e.g. "Model Number", ' +
            '"Paint Color Code", "Expiry Date").',
        },
        value: {
          label: 'Value',
          type: 'string',
          description: 'The value exactly as printed on the document.',
        },
      },
    },
  },
};

/**
 * The PATCH body that swaps a document's stored metadata for `next`. The engine
 * deep-merges an object field (RFC 7396), so sending `next` alone would keep
 * every key it leaves out — a previous type's fields, or `unknown`'s facts once
 * a type matches. Each such key goes out as `null`, which the merge deletes.
 */
export function replaceMetadata<T extends Record<string, unknown>>(
  previous: Record<string, unknown> | undefined,
  next: T,
): T {
  const cleared: Record<string, null> = {};
  for (const key of Object.keys(previous ?? {})) {
    if (!(key in next)) cleared[key] = null;
  }
  return { ...cleared, ...next };
}

/** Most facts kept from one document — past this it's noise, not a card. */
const MAX_FACTS = 20;

/**
 * Narrow a stored (or model-returned) `facts` value to clean pairs: drops
 * entries missing a label or value, trims both, removes repeats, and caps the
 * list. Anything that isn't a list reads as none.
 */
export function readFacts(value: unknown): DocFact[] {
  if (!Array.isArray(value)) return [];
  const facts: DocFact[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { label, value: raw } = entry as Record<string, unknown>;
    if (typeof label !== 'string' || typeof raw !== 'string') continue;
    const fact = { label: label.trim(), value: raw.trim() };
    const key = `${fact.label.toLowerCase()}\n${fact.value.toLowerCase()}`;
    if (!fact.label || !fact.value || seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
    if (facts.length === MAX_FACTS) break;
  }
  return facts;
}

/** Kebab-case: doc type ids become discriminator values, which aepbase keys on. */
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
/** Snake_case: field names become column names. */
const SNAKE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
/**
 * A `{placeholder}` in a {@link DocType.title_template}. Global (used with
 * `replace`/`matchAll`, never `test`/`exec`, so its `lastIndex` never leaks) and
 * deliberately loose on the inner text — `parseTitleTemplate` validates each
 * captured name is snake_case, giving a precise error instead of a silent miss.
 */
const TITLE_PLACEHOLDER_RE = /\{([^{}]*)\}/g;

/**
 * Validate one doc type object. `source` names the module in errors — an
 * operator's typo should say which file, not just what.
 *
 * The builtins are TypeScript-checked at compile time; this pass exists for the
 * invariants the type system can't express (kebab-case id, snake_case fields,
 * the reserved `unknown` id) and to guard operator-authored overrides, which
 * are dynamically imported and unchecked. Throws rather than skipping: a doc
 * type that silently fails to load looks exactly like one the AI never matches,
 * which is painful to debug.
 */
export function validateDocType(input: unknown, source: string): DocType {
  const fail = (message: string): never => {
    throw new Error(`[documents] invalid doc type "${source}": ${message}`);
  };

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail('module must default-export a doc type object');
  }

  const doc = input as Record<string, unknown>;
  const { id, label, description, icon, fields } = doc;

  if (typeof id !== 'string' || !KEBAB_RE.test(id)) {
    return fail(`id ${JSON.stringify(id)} must be kebab-case`);
  }
  if (id === UNKNOWN_DOC_TYPE) {
    return fail(`id "${UNKNOWN_DOC_TYPE}" is reserved for unmatched documents`);
  }
  if (typeof label !== 'string' || !label.trim()) return fail('label is required');
  if (typeof description !== 'string' || !description.trim()) {
    return fail('description is required — it is what the model classifies on');
  }
  if (typeof icon !== 'function') {
    return fail(
      'icon is required — a lazy Lucide import, e.g. ' +
        '() => import("lucide-react").then((m) => m.FileText)',
    );
  }
  const { post_classify } = doc;
  if (post_classify !== undefined && typeof post_classify !== 'function') {
    return fail('post_classify must be a function (a lazy import of the hook)');
  }

  const category = parseCategory(doc.category, fail);
  const parsed = parseFields(fields, '', fail);
  const titleTemplate = parseTitleTemplate(doc.title_template, parsed, fail);
  return {
    id,
    label,
    description,
    icon: icon as LazyIcon,
    ...(category ? { category } : {}),
    fields: parsed,
    ...(titleTemplate ? { title_template: titleTemplate } : {}),
    ...(post_classify ? { post_classify: post_classify as DocType['post_classify'] } : {}),
  };
}

/**
 * Parse and validate the optional `category`. Absent → undefined (the type is
 * uncategorized); present → one lowercase kebab-case label. Same casing rule as
 * ids so a shared category ("tax") is one bucket, not "tax" and "Tax" split.
 */
function parseCategory(
  input: unknown,
  fail: (message: string) => never,
): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== 'string' || !KEBAB_RE.test(input)) {
    return fail(`category ${JSON.stringify(input)} must be a lowercase kebab-case string`);
  }
  return input;
}

/**
 * Parse and validate the optional `title_template`. Absent → undefined (the type
 * keeps the model-authored title); present → the template string, unchanged.
 *
 * Guards what an operator can get wrong at authoring time: it must be a
 * non-empty string, carry at least one `{placeholder}` (a template with none is
 * a constant title, always a mistake), balance its braces, and name each
 * placeholder in snake_case. A placeholder that matches a declared field must
 * point at a `string`/`number` one — those are the values that can render into a
 * title; an `array`/`object` field never can, so catch it here rather than have
 * it silently drop the title to the model fallback at classify time. A
 * placeholder that matches no field is a free (model-filled) one and needs no
 * such check.
 */
function parseTitleTemplate(
  input: unknown,
  fields: Record<string, DocField>,
  fail: (message: string) => never,
): string | undefined {
  if (input === undefined) return undefined;
  if (typeof input !== 'string' || !input.trim()) {
    return fail('title_template, when set, must be a non-empty string');
  }
  const names: string[] = [];
  const stripped = input.replace(TITLE_PLACEHOLDER_RE, (_match, name: string) => {
    names.push(name);
    return '';
  });
  if (stripped.includes('{') || stripped.includes('}')) {
    return fail(`title_template ${JSON.stringify(input)} has an unbalanced { or }`);
  }
  if (!names.length) {
    return fail('title_template must contain at least one {placeholder}');
  }
  for (const name of names) {
    if (!SNAKE_RE.test(name)) {
      return fail(`title_template placeholder "{${name}}" must be snake_case`);
    }
    const field = fields[name];
    if (field && field.type !== 'string' && field.type !== 'number') {
      return fail(
        `title_template placeholder "{${name}}" refers to the ${field.type} field ` +
          `"${name}" — only string or number fields can fill a title`,
      );
    }
  }
  return input;
}

/**
 * Parse and validate a field map, recursing into array `items` and object
 * `properties`. `path` prefixes error messages (empty at the top level).
 */
function parseFields(
  input: unknown,
  path: string,
  fail: (message: string) => never,
): Record<string, DocField> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail(`${path || 'fields'} must be an object`);
  }
  const parsed: Record<string, DocField> = {};
  for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
    const fieldPath = path ? `${path}.${name}` : name;
    if (!SNAKE_RE.test(name)) {
      return fail(`field "${fieldPath}" must be snake_case`);
    }
    parsed[name] = parseField(fieldPath, value, fail);
  }
  if (!Object.keys(parsed).length) {
    return fail(`${path || 'the type'} declares no fields`);
  }
  return parsed;
}

/** Parse and validate one field, recursing into composite `array`/`object` shapes. */
function parseField(
  fieldPath: string,
  value: unknown,
  fail: (message: string) => never,
): DocField {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(`field "${fieldPath}" must be a mapping`);
  }
  const field = value as Record<string, unknown>;
  if (typeof field.label !== 'string' || !field.label.trim()) {
    return fail(`field "${fieldPath}" needs a label`);
  }
  const type = field.type;
  if (type !== 'string' && type !== 'number' && type !== 'array' && type !== 'object') {
    return fail(
      `field "${fieldPath}" type must be "string", "number", "array", or "object"`,
    );
  }
  if (field.description !== undefined && typeof field.description !== 'string') {
    return fail(`field "${fieldPath}" description must be a string`);
  }
  if (field.person !== undefined) {
    if (typeof field.person !== 'boolean') {
      return fail(`field "${fieldPath}" person must be a boolean`);
    }
    // A person marker names a single name value, so it only makes sense on a
    // string leaf. For a list of people, mark the array's `items`, not the array.
    if (field.person && type !== 'string') {
      return fail(`field "${fieldPath}" person is only valid on a string field`);
    }
  }
  const out: DocField = {
    label: field.label,
    type,
    ...(field.description ? { description: field.description } : {}),
    ...(field.person ? { person: true } : {}),
  };
  if (type === 'array') {
    if (field.items === undefined) {
      return fail(`array field "${fieldPath}" must declare items`);
    }
    out.items = parseField(`${fieldPath}[]`, field.items, fail);
  } else if (field.items !== undefined) {
    return fail(`field "${fieldPath}" declares items but is not an array`);
  }
  if (type === 'object') {
    if (field.properties === undefined) {
      return fail(`object field "${fieldPath}" must declare properties`);
    }
    out.properties = parseFields(field.properties, fieldPath, fail);
  } else if (field.properties !== undefined) {
    return fail(`field "${fieldPath}" declares properties but is not an object`);
  }
  return out;
}

/**
 * Doc types → `FieldDef` variants for the `metadata` field.
 *
 * Every variant's fields share one derived column per name, so the translator
 * requires a name used by two doc types to agree on type. That check lives in
 * homestead-core; here we just surface the conflict with the doc-type ids in
 * the message, which is what an operator can actually act on.
 */
export function toVariants(types: DocType[]): Record<string, Record<string, FieldDef>> {
  const seen = new Map<string, { type: DocFieldType; id: string }>();
  const variants: Record<string, Record<string, FieldDef>> = {};

  // The unmatched case is declared last so it sorts predictably in the emitted
  // schema. Its fields share columns with the rest, so it takes the same check.
  const entries: [string, Record<string, DocField>][] = [
    ...types.map((type): [string, Record<string, DocField>] => [type.id, type.fields]),
    [UNKNOWN_DOC_TYPE, UNKNOWN_FIELDS],
  ];
  for (const [id, docFields] of entries) {
    const fields: Record<string, FieldDef> = {};
    for (const [name, field] of Object.entries(docFields)) {
      const prior = seen.get(name);
      if (prior && prior.type !== field.type) {
        throw new Error(
          `[documents] "${name}" is a ${prior.type} in doc type "${prior.id}" but a ` +
            `${field.type} in "${id}". Document types share one column per field ` +
            `name, so a shared name must have the same type in every type that uses it — ` +
            `rename one of them.`,
        );
      }
      if (!prior) seen.set(name, { type: field.type, id });
      fields[name] = docFieldToFieldDef(field);
    }
    variants[id] = fields;
  }
  return variants;
}

/**
 * One `DocField` → the `FieldDef` the translator turns into wire schema,
 * recursing into array `items` and object `properties`. The type-agreement
 * check in {@link toVariants} guards only the top-level (column) names; nested
 * shapes travel with their parent, so they need no cross-variant reconciliation.
 */
function docFieldToFieldDef(field: DocField): FieldDef {
  const def: FieldDef = {
    type: field.type,
    singular_name: field.label,
    ...(field.description ? { description: field.description } : {}),
  };
  if (field.type === 'array' && field.items) {
    def.items = docFieldToFieldDef(field.items);
  }
  if (field.type === 'object' && field.properties) {
    def.properties = Object.fromEntries(
      Object.entries(field.properties).map(([name, sub]) => [
        name,
        docFieldToFieldDef(sub),
      ]),
    );
  }
  return def;
}

/**
 * The doc_type values a classification pass may return: every known type id
 * plus the reserved `unknown` tag.
 *
 * Classification is handed this as a small Zod enum — it is the *whole*
 * classification schema, alongside a title and a confidence — so that schema
 * stays tiny however many types are configured. Field extraction is a separate,
 * per-type pass (see {@link toExtractionSchema}). Splitting the two is what
 * keeps either schema small: unioning every type's fields into one
 * structured-output schema produced a constraint the model's serving engine
 * rejected outright ("too many states for serving") once the catalogue grew
 * past a handful of types.
 */
export function docTypeIds(types: DocType[]): [string, ...string[]] {
  // Always non-empty (the `unknown` tag is unconditional), but a trailing spread
  // widens to `string[]`; the cast asserts the non-empty tuple z.enum requires.
  return [...types.map((t) => t.id), UNKNOWN_DOC_TYPE] as unknown as [
    string,
    ...string[],
  ];
}

/**
 * One doc type → the Zod object the model fills in the extraction pass.
 *
 * Only ever built for the single type classification already matched, so the
 * schema carries one type's fields, not every type's — small no matter how many
 * types exist, and focused on the fields the document actually has. See
 * {@link docTypeIds} for why classification and extraction are separate passes.
 *
 * Every field is `.nullable()`, not `.optional()`: a partial read degrades to
 * null fields rather than failing validation and losing the whole extraction.
 * The distinction matters to Gemini, not just to Zod. An optional field
 * serialises to a property merely *absent* from `required`, and Gemini 2.5
 * Flash's structured-output engine aborts on that — finishReason "OTHER", zero
 * output tokens, every time (even a single optional field triggers it). A
 * nullable field serialises to `nullable: true`, which Gemini honours: it emits
 * every key, using null for the ones it can't find. `classify` strips the nulls
 * before storing.
 */
export function toExtractionSchema(type: DocType) {
  return fieldsToExtractionSchema(type.fields);
}

/** The extraction schema for an unmatched document: its free-form facts. */
export function toUnknownExtractionSchema() {
  return fieldsToExtractionSchema(UNKNOWN_FIELDS);
}

function fieldsToExtractionSchema(fields: Record<string, DocField>) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, field] of Object.entries(fields)) {
    shape[name] = docFieldToZod(field)
      .nullable()
      .describe(field.description ?? field.label);
  }
  return z.object(shape);
}

/**
 * One `DocField` → its Zod *value* schema (the caller adds the outer
 * `.nullable()` for a named field). Recurses for composite shapes:
 *   - `object` → every property nullable-and-described, mirroring the top-level
 *     rule so Gemini emits every key (null when unfound) instead of aborting.
 *   - `array`  → elements are the item schema, left non-nullable — a list holds
 *     values, not null holes; an object element still carries nullable props.
 */
function docFieldToZod(field: DocField): z.ZodTypeAny {
  switch (field.type) {
    case 'number':
      return z.number();
    case 'array':
      // `parseField` guarantees `items` on an array; `!` narrows for the type.
      return z.array(docFieldToZod(field.items!));
    case 'object': {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [name, sub] of Object.entries(field.properties!)) {
        shape[name] = docFieldToZod(sub)
          .nullable()
          .describe(sub.description ?? sub.label);
      }
      return z.object(shape);
    }
    case 'string':
    default:
      return z.string();
  }
}

/** Every `{placeholder}` name in a title template, in order (duplicates kept). */
function titleTemplatePlaceholders(template: string): string[] {
  return [...template.matchAll(TITLE_PLACEHOLDER_RE)].map((match) => match[1]!);
}

/**
 * A type's title-template placeholders that are *not* one of its declared
 * fields — the "free" ones the model fills off the document during the
 * extraction pass (see {@link DocType.title_template}). Deduplicated, in
 * first-seen order. Empty when the type has no template (or every placeholder is
 * field-backed). `classify` adds one nullable string to the extraction schema
 * per name returned here, then strips them back out before storing metadata.
 */
export function freeTitlePlaceholders(type: DocType): string[] {
  if (!type.title_template) return [];
  const declared = new Set(Object.keys(type.fields));
  const seen = new Set<string>();
  const free: string[] = [];
  for (const name of titleTemplatePlaceholders(type.title_template)) {
    if (declared.has(name) || seen.has(name)) continue;
    seen.add(name);
    free.push(name);
  }
  return free;
}

/**
 * Render a title template against a bag of values (extracted field values plus
 * any free-placeholder values the model read). Returns the filled title, or
 * `null` when any placeholder is unfilled — a null/absent value, a blank string,
 * or a non-scalar (arrays/objects can't render into a title). A null return is
 * the signal for `classify` to fall back to the model-authored title rather than
 * emit one with an empty slot. Numbers render verbatim (e.g. a `tax_year` of
 * 2024 → "2024"); strings are trimmed.
 */
export function renderTitleTemplate(
  template: string,
  values: Record<string, unknown>,
): string | null {
  let missing = false;
  const rendered = template.replace(TITLE_PLACEHOLDER_RE, (_match, name: string) => {
    const value = values[name];
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
    missing = true;
    return '';
  });
  if (missing) return null;
  return rendered.trim() || null;
}
