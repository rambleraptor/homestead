/**
 * Translate the authoring-friendly `FieldDef` map into the JSON-schema
 * wire format aepbase's `/aep-resource-definitions` endpoint accepts,
 * and validate names early so a bad definition fails at boot with a
 * clear error instead of an aepbase 400.
 *
 * Translation rules:
 *   - `type: 'file'`        → `type: 'binary'` + `'x-aepbase-file-field': true`,
 *                             at any depth (top level, array items, object
 *                             properties)
 *   - per-field `required`  → collected into the schema-level `required` array
 *   - `enum`                → appended to the wire `description` as
 *                             `one of: a, b` (aepbase strips JSON-schema enum)
 *   - `singular_name` / `plural_name` → authoring-only display metadata, stripped
 *   - `ai` (on file fields) → authoring-only, stripped; a file field opted into
 *                             text extraction gains a synthesized companion
 *                             `<field>_text` string property in the wire schema
 */

import { APP_FLAGS } from '../app-flags/sync';
import { fieldName as flagFieldName } from '../settings/flags';
import {
  companionTextField,
  fileExtractsText,
} from './ai-fields';
import type {
  FieldDef,
  FieldType,
  JsonSchemaProperty,
  ResourceDefinition,
  ResourceReference,
  ResourceSchema,
} from './types';

/** aepbase's built-in root resource (EnableUsers); never declared in code. */
const BUILTIN_REFERENCE_TARGETS: ReadonlySet<string> = new Set(['user']);

/** Delete-time behaviors a reference may declare. */
const ON_DELETE_VALUES: ReadonlySet<string> = new Set([
  'restrict',
  'cascade',
  'set-null',
]);

/** Kebab-case: aepbase rejects URL params with uppercase letters. */
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
/** Snake_case: the convention for stored field names. */
const SNAKE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/**
 * Validate a definition's names and field shapes. Throws with a
 * `[resources]`-prefixed message naming the offending definition.
 */
export function validateResourceDefinition(def: ResourceDefinition): void {
  const fail = (message: string): never => {
    throw new Error(`[resources] invalid definition "${def.singular}": ${message}`);
  };

  if (!KEBAB_RE.test(def.singular)) {
    fail(`singular "${def.singular}" must be kebab-case`);
  }
  if (!KEBAB_RE.test(def.plural)) {
    fail(`plural "${def.plural}" must be kebab-case`);
  }
  for (const parent of def.parents ?? []) {
    if (!KEBAB_RE.test(parent)) {
      fail(`parent "${parent}" must be kebab-case`);
    }
  }
  validateFields(def.fields, '', fail);
  validateFilePlacement(def.fields, fail);
  validateAccess(def, fail);
  validateRetention(def, fail);
}

/**
 * Check a `retention` declaration. A mistake here deletes data on a schedule,
 * so every ambiguity fails the boot rather than guessing.
 */
function validateRetention(
  def: ResourceDefinition,
  fail: (message: string) => never,
): void {
  const retention = def.retention;
  if (!retention) return;
  if (!Number.isInteger(retention.days) || retention.days < 1) {
    fail(`retention.days must be a positive integer (got ${String(retention.days)})`);
  }
  const parents = def.parents ?? [];
  if (parents.length > 0 && !(parents.length === 1 && parents[0] === 'user')) {
    // A child of an ordinary parent is deleted with its parent; sweeping it
    // independently would need a walk over every parent record. Under `user`
    // the sweep walks every user, which is cheap and bounded.
    fail(
      'retention is only valid on a top-level or user-parented resource — ' +
        'a child of anything else goes when its parent does',
    );
  }
  if (retention.field !== undefined && !ENGINE_TIMESTAMPS.has(retention.field)) {
    const field = def.fields[retention.field];
    if (!field) fail(`retention.field "${retention.field}" is not a declared field`);
    if (field.type !== 'string' || field.format !== 'date-time') {
      fail(`retention.field "${retention.field}" must be a string field with format "date-time"`);
    }
  }
  if (retention.where !== undefined && retention.where.trim() === '') {
    fail('retention.where must be a non-empty filter (omit it to sweep every row)');
  }
}

/** Engine-managed timestamps every resource has; valid as `retention.field`. */
const ENGINE_TIMESTAMPS = new Set(['create_time', 'update_time']);

/**
 * Check a `per-record` access declaration against the fields it names.
 *
 * The declaration turns into a *grant filter* at seed time, so a mistake here
 * doesn't fail loudly at runtime — it silently produces a filter that matches
 * nothing, and every row of the collection becomes invisible to everyone but
 * its owner. Failing the boot instead is the whole point.
 */
function validateAccess(
  def: ResourceDefinition,
  fail: (message: string) => never,
): void {
  const parents = def.parents ?? [];
  if (def.independent_access) {
    if (parents.length === 0) {
      fail('independent_access needs a parent — a top-level resource is already independent');
    }
    if (parents.includes('user')) {
      // The user subtree is scoped by path (`checkUserScope`), never by grants,
      // so there is no independent rule for it to opt into.
      fail('independent_access is not valid on a user-parented resource');
    }
  }

  const access = def.access;
  if (!access || access.model !== 'per-record') return;


  const { field, sharedValue, privateValue } = access;
  if (sharedValue === privateValue) {
    fail(`access.sharedValue and access.privateValue must differ ("${sharedValue}")`);
  }

  const def_ = def.fields[field];
  if (!def_) {
    fail(`access.field "${field}" is not a declared field`);
  }
  if (def_.type !== 'string') {
    fail(`access.field "${field}" must be a string field (got "${def_.type}")`);
  }
  const values = def_.enum;
  if (!values) {
    fail(`access.field "${field}" must declare an enum`);
  }
  for (const value of [sharedValue, privateValue]) {
    if (!values.includes(value)) {
      fail(`access.field "${field}" enum does not include "${value}"`);
    }
  }
  if (def_.default === undefined) {
    fail(`access.field "${field}" must declare a default`);
  }
  if (def_.default !== sharedValue && def_.default !== privateValue) {
    fail(
      `access.field "${field}" default "${String(def_.default)}" must be ` +
        `either "${sharedValue}" or "${privateValue}"`,
    );
  }
  if (def_.required) {
    // It has a default, so requiring it would only break existing create paths.
    fail(`access.field "${field}" must not be required — it has a default`);
  }
  if (!def_.immutable) {
    // Visibility is decided at create. A mutable discriminator would let anyone
    // with write access hide a household row from the rest of the household.
    fail(`access.field "${field}" must be immutable`);
  }
  if ((def.parents ?? []).includes('user')) {
    // A user-parented resource is scoped by path — `checkUserScope` governs it
    // and the router never consults a grant, so the filter would be inert.
    fail(`access model "per-record" is not valid on a user-parented resource`);
  }
  if (parents.length > 0 && !def.independent_access) {
    // An inheriting child's rows are authorized through its parent; the engine
    // never consults its own row grants, so the discriminator would be inert.
    fail(
      'access model "per-record" is not valid on a child that inherits its ' +
        "parent's access — set independent_access, or declare it on the parent",
    );
  }
}

function validateFields(
  fields: Record<string, FieldDef>,
  path: string,
  fail: (message: string) => never,
): void {
  for (const [name, field] of Object.entries(fields)) {
    const fieldPath = path ? `${path}.${name}` : name;
    if (!SNAKE_RE.test(name)) {
      fail(`field "${fieldPath}" must be snake_case`);
    }
    if (fileExtractsText(field)) {
      const companion = companionTextField(name);
      if (companion in fields) {
        fail(
          `file field "${fieldPath}" auto-generates a companion "${companion}" ` +
            `field, but "${companion}" is already declared — rename or remove it`,
        );
      }
    }
    if (field.encrypted && path) {
      fail(`field "${fieldPath}" is nested; only top-level fields can be encrypted`);
    }
    validateField(field, fieldPath, fail);
  }
}

/** Whether a field holds a file or a reference anywhere inside it. */
function holdsFileOrReference(field: FieldDef): boolean {
  if (field.type === 'file' || field.reference) return true;
  if (field.items && holdsFileOrReference(field.items)) return true;
  if (Object.values(field.properties ?? {}).some(holdsFileOrReference)) return true;
  return Object.values(field.variants ?? {}).some((fields) => Object.values(fields).some(holdsFileOrReference));
}

/**
 * An encrypted field is stored as ciphertext: it must be a type the engine can
 * encrypt, and hold nothing the engine needs to read in plaintext.
 */
function validateEncrypted(field: FieldDef, path: string, fail: (message: string) => never): void {
  if (!field.encrypted) return;
  if (field.type !== 'string' && field.type !== 'object' && field.type !== 'array') {
    fail(`field "${path}" is ${field.type}; only string, object and array fields can be encrypted`);
  }
  if (field.enum) fail(`field "${path}" declares enum values and can't also be encrypted`);
  if (holdsFileOrReference(field)) {
    fail(`field "${path}" holds a file or a reference, which can't be encrypted`);
  }
}

function validateField(
  field: FieldDef,
  path: string,
  fail: (message: string) => never,
): void {
  if (field.enum && field.type !== 'string') {
    fail(`field "${path}" declares enum but is not a string`);
  }
  if (field.deprecated && field.required) {
    fail(`field "${path}" cannot be both deprecated and required`);
  }
  validateReference(field, path, fail);
  validateEncrypted(field, path, fail);
  if (field.items?.encrypted) {
    fail(`field "${path}[]" is nested; only top-level fields can be encrypted`);
  }
  if (field.items && field.type !== 'array') {
    fail(`field "${path}" declares items but is not an array`);
  }
  if (field.type === 'array' && !field.items) {
    fail(`array field "${path}" must declare items`);
  }
  if (field.properties && field.type !== 'object') {
    fail(`field "${path}" declares properties but is not an object`);
  }
  validateConstraintKeywords(field, path, fail);
  validateVariants(field, path, fail);
  validateFileAi(field, path, fail);
  if (field.default !== undefined) {
    if (field.type === 'file') {
      fail(`field "${path}" is a file field and cannot declare a default`);
    }
    if (field.enum && !field.enum.includes(field.default as string)) {
      fail(`field "${path}" default must be one of its enum values`);
    }
    const typeErr = checkDefaultType(field.type, field.default);
    if (typeErr) fail(`field "${path}" default ${typeErr}`);
  }
  validateDefaultFromFlag(field, path, fail);
  if (field.properties) validateFields(field.properties, path, fail);
  if (field.items) validateField(field.items, `${path}[]`, fail);
}

/**
 * Validate a tagged-union object field.
 *
 * The type-consistency rule is the load-bearing one: every variant's fields are
 * flattened into one generated column per *distinct field name*, so a name
 * shared across variants must agree on type. OpenAPI permits the mismatch; our
 * storage cannot, so it fails at boot rather than at query time.
 */
function validateVariants(
  field: FieldDef,
  path: string,
  fail: (message: string) => never,
): void {
  if (field.variants && field.type !== 'object') {
    fail(`field "${path}" declares variants but is not an object`);
  }
  if (field.discriminator && !field.variants) {
    fail(`field "${path}" declares a discriminator but no variants`);
  }
  if (!field.variants) return;
  if (!field.discriminator) {
    fail(`field "${path}" declares variants but no discriminator`);
  }

  const tag = field.discriminator;
  if (!SNAKE_RE.test(tag)) {
    fail(`field "${path}" discriminator "${tag}" must be snake_case`);
  }
  if (field.properties) {
    fail(`field "${path}" cannot declare both properties and variants`);
  }
  if (!Object.keys(field.variants).length) {
    fail(`field "${path}" declares variants but the map is empty`);
  }

  // field name -> the type the first variant declaring it used
  const seen = new Map<string, { type: FieldType; variant: string }>();
  for (const [variantId, fields] of Object.entries(field.variants)) {
    if (!KEBAB_RE.test(variantId)) {
      fail(`field "${path}" variant "${variantId}" must be kebab-case`);
    }
    if (tag in fields) {
      fail(
        `field "${path}" variant "${variantId}" must not declare the ` +
          `discriminator "${tag}" — the translator injects it`,
      );
    }
    validateFields(fields, `${path}.${variantId}`, fail);

    for (const [name, sub] of Object.entries(fields)) {
      const prior = seen.get(name);
      if (prior && prior.type !== sub.type) {
        fail(
          `field "${path}" declares "${name}" as ${prior.type} in variant ` +
            `"${prior.variant}" but ${sub.type} in "${variantId}" — variants ` +
            `share one column per field name, so types must agree`,
        );
      }
      if (!prior) seen.set(name, { type: sub.type, variant: variantId });
    }
  }
}

/** Numeric assertion keywords, valid only on `number`/`integer` fields. */
const NUMERIC_CONSTRAINTS = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
] as const;
/** Length/pattern keywords, valid only on `string` fields. */
const STRING_CONSTRAINTS = ['minLength', 'maxLength', 'pattern'] as const;
/** Cardinality keywords, valid only on `array` fields. */
const ARRAY_CONSTRAINTS = ['minItems', 'maxItems', 'uniqueItems'] as const;

/**
 * Collect the standard JSON-schema assertion keywords a field declares into the
 * wire property. Only the keywords appropriate to the field's type are emitted;
 * {@link validateConstraintKeywords} has already rejected mismatches at boot, so
 * this is a straight copy of present values.
 */
function constraintKeywords(field: FieldDef): Partial<JsonSchemaProperty> {
  const out: Partial<JsonSchemaProperty> = {};
  const names =
    field.type === 'number' || field.type === 'integer'
      ? NUMERIC_CONSTRAINTS
      : field.type === 'string'
        ? STRING_CONSTRAINTS
        : field.type === 'array'
          ? ARRAY_CONSTRAINTS
          : [];
  const src = field as unknown as Record<string, unknown>;
  for (const name of names) {
    const value = src[name];
    if (value !== undefined) (out as Record<string, unknown>)[name] = value;
  }
  return out;
}

/**
 * Validate a field's assertion keywords: each keyword must sit on the field type
 * it applies to, bounds must be sane (min ≤ max, non-negative integer lengths /
 * counts, positive `multipleOf`), and a `pattern` must compile. Keywords on the
 * wrong type are rejected rather than silently dropped, so a typo fails loudly at
 * boot instead of producing a form/OpenAPI constraint that never fires.
 */
function validateConstraintKeywords(
  field: FieldDef,
  path: string,
  fail: (message: string) => never,
): void {
  const f = field as unknown as Record<string, unknown>;
  const isNumeric = field.type === 'number' || field.type === 'integer';

  const misplaced = (name: string, allowed: boolean, kind: string): void => {
    if (f[name] !== undefined && !allowed) {
      fail(`field "${path}" declares "${name}" but is not ${kind}`);
    }
  };
  for (const name of NUMERIC_CONSTRAINTS) misplaced(name, isNumeric, 'a number');
  for (const name of STRING_CONSTRAINTS) misplaced(name, field.type === 'string', 'a string');
  for (const name of ARRAY_CONSTRAINTS) misplaced(name, field.type === 'array', 'an array');

  const nonNegInt = (name: string): void => {
    const v = f[name];
    if (v === undefined) return;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      fail(`field "${path}" ${name} must be a non-negative integer`);
    }
  };
  nonNegInt('minLength');
  nonNegInt('maxLength');
  nonNegInt('minItems');
  nonNegInt('maxItems');

  const orderedBounds = (lo: string, hi: string): void => {
    if (typeof f[lo] === 'number' && typeof f[hi] === 'number' && (f[lo] as number) > (f[hi] as number)) {
      fail(`field "${path}" ${lo} must not exceed ${hi}`);
    }
  };
  orderedBounds('minimum', 'maximum');
  orderedBounds('minLength', 'maxLength');
  orderedBounds('minItems', 'maxItems');

  if (field.multipleOf !== undefined && !(typeof field.multipleOf === 'number' && field.multipleOf > 0)) {
    fail(`field "${path}" multipleOf must be a positive number`);
  }
  if (field.pattern !== undefined) {
    try {
      new RegExp(field.pattern);
    } catch {
      fail(`field "${path}" pattern is not a valid regular expression`);
    }
  }
}

/**
 * Where files may sit. Anywhere in the field tree except inside tagged-union
 * variants (whose fields are flattened into shared columns), and `ai` options
 * only on a top-level file — the index pipeline works per record and field.
 */
function validateFilePlacement(
  fields: Record<string, FieldDef>,
  fail: (message: string) => never,
): void {
  const walk = (field: FieldDef, path: string, topLevel: boolean, inVariant: boolean): void => {
    if (field.type === 'file') {
      if (inVariant) fail(`field "${path}" is a file inside a tagged-union variant, which isn't supported`);
      if (field.ai && !topLevel) fail(`field "${path}" declares ai options, which only a top-level file may`);
    }
    if (field.items) walk(field.items, `${path}[]`, false, inVariant);
    for (const [name, sub] of Object.entries(field.properties ?? {})) {
      walk(sub, `${path}.${name}`, false, inVariant);
    }
    for (const [variant, vfields] of Object.entries(field.variants ?? {})) {
      for (const [name, sub] of Object.entries(vfields)) {
        walk(sub, `${path}.${variant}.${name}`, false, true);
      }
    }
  };
  for (const [name, field] of Object.entries(fields)) walk(field, name, true, false);
}

/**
 * Validate a file field's `ai` block. `ai` is only meaningful on file fields;
 * `embed` implies `extract_text`, so an explicit `extract_text: false` beside a
 * truthy `embed` is contradictory; chunk/overlap must be sane.
 */
function validateFileAi(
  field: FieldDef,
  path: string,
  fail: (message: string) => never,
): void {
  const ai = field.ai;
  if (!ai) return;
  if (field.type !== 'file') {
    fail(`field "${path}" declares ai options but is not a file field`);
  }
  if (ai.embed && ai.extract_text === false) {
    fail(
      `field "${path}" sets embed but extract_text:false — embedding requires ` +
        `extracted text`,
    );
  }
  if (typeof ai.embed === 'object') {
    const { chunk_size, overlap } = ai.embed;
    if (chunk_size !== undefined && chunk_size <= 0) {
      fail(`field "${path}" embed.chunk_size must be a positive number`);
    }
    if (overlap !== undefined && overlap < 0) {
      fail(`field "${path}" embed.overlap must not be negative`);
    }
    if (
      chunk_size !== undefined &&
      overlap !== undefined &&
      overlap >= chunk_size
    ) {
      fail(`field "${path}" embed.overlap must be smaller than chunk_size`);
    }
  }
}

/**
 * Validate a `defaultFromFlag` annotation. Like a static `default` it only
 * makes sense on a string field, and it can't coexist with a static `default`
 * (two sources of truth) or an `enum` (a flag value isn't a fixed member of a
 * closed set). It *does* compose with `reference` — a default store id is still
 * a store reference. The named flag's existence isn't checked here; a bad
 * `app`/`key` simply resolves to no default at runtime.
 */
function validateDefaultFromFlag(
  field: FieldDef,
  path: string,
  fail: (message: string) => never,
): void {
  const from = field.defaultFromFlag;
  if (!from) return;
  if (field.type !== 'string') {
    fail(`field "${path}" declares defaultFromFlag but is not a string`);
  }
  if (field.default !== undefined) {
    fail(`field "${path}" declares both default and defaultFromFlag — use one`);
  }
  if (field.enum) {
    fail(`field "${path}" declares both enum and defaultFromFlag — a field is one or the other`);
  }
  if (!from.app || !from.key) {
    fail(`field "${path}" defaultFromFlag must name both an app and a key`);
  }
}

/**
 * Validate a resource-reference annotation's shape. Cross-definition existence
 * of the target is checked separately by {@link validateReferenceTargets},
 * once the full definition set is known.
 */
function validateReference(
  field: FieldDef,
  path: string,
  fail: (message: string) => never,
): void {
  const ref = field.reference;
  if (!ref) return;
  if (field.type !== 'string') {
    fail(
      `field "${path}" declares a reference but is not a string — for a ` +
        `to-many reference, annotate the array's items`,
    );
  }
  if (field.enum) {
    fail(`field "${path}" declares both enum and reference — a field is one or the other`);
  }
  if (!KEBAB_RE.test(ref.resource)) {
    fail(`field "${path}" reference resource "${ref.resource}" must be kebab-case`);
  }
  if (ref.onDelete && !ON_DELETE_VALUES.has(ref.onDelete)) {
    fail(
      `field "${path}" reference onDelete "${ref.onDelete}" must be one of ` +
        `restrict, cascade, set-null`,
    );
  }
  // set-null clears the field on the referencing record; a required scalar
  // field can't be nulled. (Array-item references have no `required` — set-null
  // there removes the element, which is always valid.)
  if (ref.onDelete === 'set-null' && field.required) {
    fail(`field "${path}" uses onDelete: set-null but is required — a required field cannot be nulled`);
  }
}

/**
 * Cross-definition check: every `reference.resource` must name a declared
 * resource, or the built-in `user` root. Runs after per-definition validation,
 * once the full set is known (a single definition can't see its siblings).
 * Throws a `[resources]`-prefixed error naming the offending field.
 */
export function validateReferenceTargets(defs: ResourceDefinition[]): void {
  const known = new Set<string>([
    ...BUILTIN_REFERENCE_TARGETS,
    ...defs.map((d) => d.singular),
  ]);
  for (const def of defs) {
    walkReferences(def.fields, '', (fieldPath, ref) => {
      if (!known.has(ref.resource)) {
        throw new Error(
          `[resources] invalid definition "${def.singular}": field ` +
            `"${fieldPath}" references unknown resource "${ref.resource}"`,
        );
      }
    });
  }
}

/** A resource sync's identity for validation — a subset of `ResourceSync`. */
export interface SyncResourceTarget {
  id: string;
  resource: string;
  appId?: string;
}

/**
 * Boot check: every resource sync must name a resource that actually exists on
 * this instance, so a typo or a sync pointing at an app that isn't installed
 * fails loudly at boot instead of silently never firing. The sibling of
 * {@link validateReferenceTargets} for `AppConfig.syncs` / `HomesteadConfig.syncs`.
 *
 * `known` is the full set of resource singulars the instance declares — the
 * caller passes it because some resources (the built-in `user`, and the
 * dynamically-synced `user-preference` / `app-flag`) aren't in the static
 * definition list. Throws a `[resources]`-prefixed error naming the offending
 * sync and resource.
 */
export function validateSyncResources(
  known: Iterable<string>,
  syncs: readonly SyncResourceTarget[],
): void {
  const knownSet = known instanceof Set ? known : new Set(known);
  for (const sync of syncs) {
    if (!knownSet.has(sync.resource)) {
      const where = sync.appId ? ` (app "${sync.appId}")` : '';
      throw new Error(
        `[resources] sync "${sync.id}"${where} targets unknown resource ` +
          `"${sync.resource}" — no such resource is declared`,
      );
    }
  }
}

/** Visit every reference in a field map, recursing into items/properties/variants. */
function walkReferences(
  fields: Record<string, FieldDef>,
  path: string,
  visit: (path: string, ref: ResourceReference) => void,
): void {
  for (const [name, field] of Object.entries(fields)) {
    walkFieldReferences(field, path ? `${path}.${name}` : name, visit);
  }
}

function walkFieldReferences(
  field: FieldDef,
  path: string,
  visit: (path: string, ref: ResourceReference) => void,
): void {
  if (field.reference) visit(path, field.reference);
  if (field.items) walkFieldReferences(field.items, `${path}[]`, visit);
  if (field.properties) walkReferences(field.properties, path, visit);
  for (const [variantId, vf] of Object.entries(field.variants ?? {})) {
    walkReferences(vf, `${path}.${variantId}`, visit);
  }
}

/** `form-1099-int` -> `Form1099Int`; `metadata` -> `Metadata`. */
function pascalCase(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Name of the `components.schemas` entry a variant is hoisted into, e.g.
 * `document` + `metadata` + `form-1099-int` -> `DocumentMetadataForm1099Int`.
 *
 * Namespaced by resource + field so a variant id can never collide with a real
 * resource's schema entry (which is keyed by bare singular).
 */
export function variantSchemaName(
  singular: string,
  field: string,
  variantId: string,
): string {
  return `${pascalCase(singular)}${pascalCase(field)}${pascalCase(variantId)}`;
}

/** Verify a declared default matches the field's declared type. */
function checkDefaultType(type: FieldDef['type'], value: unknown): string | null {
  switch (type) {
    case 'string':
      return typeof value === 'string' ? null : 'must be a string';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
        ? null
        : 'must be an integer';
    case 'number':
      return typeof value === 'number' ? null : 'must be a number';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'must be a boolean';
    case 'array':
      return Array.isArray(value) ? null : 'must be an array';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? null
        : 'must be an object';
    default:
      return null;
  }
}

/**
 * Translate a definition's fields into the aepbase wire schema. `singular`
 * namespaces the `components.schemas` entries that tagged-union variants are
 * hoisted into by the OpenAPI generator.
 */
export function toWireSchema(
  fields: Record<string, FieldDef>,
  singular: string,
): ResourceSchema {
  const { properties, required } = toWireProperties(
    withCompanionTextFields(fields),
    singular,
  );
  // Flag each extracted-text companion so the engine encrypts it at rest
  // (see engine/store.ts). The marker is authoritative; nothing else keys
  // encryption off the `_text` suffix.
  for (const [name, field] of Object.entries(fields)) {
    if (fileExtractsText(field)) {
      properties[companionTextField(name)]!['x-aepbase-file-text-field'] = true;
    }
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
  };
}

/**
 * Expand a top-level field map with a companion `<field>_text` string property
 * for every file field opted into text extraction. The companion is stored (so
 * aepbase creates the column and returns it on read) but never authored: it's
 * absent from the `FieldDef` map the chat CRUD-tool builder walks, so the model
 * can't set it — the index-file pipeline fills it. Only top-level file fields
 * get one; the boot validator rejects a definition that also declares the
 * companion name by hand.
 */
function withCompanionTextFields(
  fields: Record<string, FieldDef>,
): Record<string, FieldDef> {
  const out: Record<string, FieldDef> = { ...fields };
  for (const [name, field] of Object.entries(fields)) {
    if (!fileExtractsText(field)) continue;
    out[companionTextField(name)] = {
      type: 'string',
      description: `Full text extracted from ${
        field.singular_name ?? name
      } by the AI pipeline.`,
    };
  }
  return out;
}

function toWireProperties(
  fields: Record<string, FieldDef>,
  singular: string,
): {
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
} {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  for (const [name, field] of Object.entries(fields)) {
    properties[name] = toWireProperty(field, singular, name);
    if (field.required) required.push(name);
  }
  return { properties, required };
}

/**
 * Translate a tagged union into OpenAPI `oneOf` + `discriminator` + `mapping`.
 *
 * Each variant gets the discriminator injected as a required, single-value-enum
 * property — that's what makes the union unambiguous (a payload matches exactly
 * one variant) and is why OpenAPI requires the tag live inside each variant.
 */
function toWireVariants(
  field: FieldDef,
  singular: string,
  fieldName: string,
): Pick<JsonSchemaProperty, 'oneOf' | 'discriminator'> {
  const tag = field.discriminator!;
  const oneOf: JsonSchemaProperty[] = [];
  const mapping: Record<string, string> = {};

  for (const [variantId, fields] of Object.entries(field.variants!)) {
    const { properties, required } = toWireProperties(fields, singular);
    oneOf.push({
      type: 'object',
      properties: {
        [tag]: { type: 'string', enum: [variantId] },
        ...properties,
      },
      required: [tag, ...required],
    });
    mapping[variantId] = `#/components/schemas/${variantSchemaName(
      singular,
      fieldName,
      variantId,
    )}`;
  }

  return { oneOf, discriminator: { propertyName: tag, mapping } };
}

function toWireProperty(
  field: FieldDef,
  singular: string,
  fieldName: string,
): JsonSchemaProperty {
  const description = wireDescription(field);
  const prop: JsonSchemaProperty = {
    type: field.type === 'file' ? 'binary' : field.type,
    ...(description ? { description } : {}),
    ...(field.format ? { format: field.format } : {}),
    ...constraintKeywords(field),
    ...(field.default !== undefined ? { default: field.default } : {}),
    ...(field.type === 'file' ? { 'x-aepbase-file-field': true } : {}),
    ...(field.immutable ? { 'x-aepbase-immutable': true } : {}),
    ...(field.encrypted ? { 'x-aepbase-encrypted': true } : {}),
    ...(field.reference
      ? {
          'x-aepbase-reference': {
            resource: field.reference.resource,
            ...(field.reference.onDelete ? { onDelete: field.reference.onDelete } : {}),
          },
        }
      : {}),
    ...(field.defaultFromFlag
      ? {
          'x-aepbase-default-from': {
            resource: APP_FLAGS,
            field: flagFieldName(field.defaultFromFlag.app, field.defaultFromFlag.key),
          },
        }
      : {}),
  };
  if (field.items) prop.items = toWireProperty(field.items, singular, fieldName);
  if (field.properties) {
    const { properties, required } = toWireProperties(field.properties, singular);
    prop.properties = properties;
    if (required.length) prop.required = required;
  }
  if (field.variants) Object.assign(prop, toWireVariants(field, singular, fieldName));
  return prop;
}

/**
 * Wire description: the authored description, plus any authoring-only
 * annotations aepbase can't carry structurally, appended as notes —
 * `one of: a, b` for enums, `reference to a <resource> record (by id)` for
 * resource references (aepbase strips JSON-schema `enum` and custom keywords on
 * round-trip, but preserves `description`).
 */
function wireDescription(field: FieldDef): string | undefined {
  const notes: string[] = [];
  if (field.deprecated) notes.push('deprecated — do not use; scheduled for removal');
  if (field.enum?.length) notes.push(`one of: ${field.enum.join(', ')}`);
  if (field.reference) {
    notes.push(`reference to a ${field.reference.resource} record (by id)`);
  }
  if (field.defaultFromFlag) {
    notes.push(
      `defaults to the household "${field.defaultFromFlag.key}" setting when omitted`,
    );
  }
  if (field.encrypted) notes.push('encrypted at rest; cannot be filtered or sorted');
  if (!notes.length) return field.description;
  const suffix = notes.join('; ');
  return field.description ? `${field.description} (${suffix})` : suffix;
}
