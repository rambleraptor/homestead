/**
 * Shared types for aepbase resource definitions declared in TypeScript.
 *
 * Each app declares the schema for the aepbase collections it owns
 * via `AppConfig.resources`, using the authoring-friendly `FieldDef`
 * shape. The schema-sync runner translates fields into the JSON-schema
 * wire format aepbase's `/aep-resource-definitions` endpoint accepts —
 * see `packages/homestead-core/resources/translate.ts` for the
 * translation and `sync.ts` for the runner.
 */

import type { BulkImportDef } from './bulk-import/types';
import type { BulkExportDef } from './bulk-export/types';

// ----------------------------------------------------------------------------
// Authoring format — what apps write in `resources.ts`
// ----------------------------------------------------------------------------

/**
 * Field types apps may declare. `file` marks an uploaded-file field; the
 * translator turns it into aepbase's `binary` + `x-aepbase-file-field`
 * wire encoding (`binary` itself is not declarable).
 */
export type FieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'file';

/**
 * Chunking / embedding tuning for a file field's `embed`. Pass `embed: true`
 * for the instance defaults, or this object to override them per field.
 */
export interface EmbedOptions {
  /** Approx. characters per chunk before embedding. */
  chunk_size?: number;
  /** Characters of overlap between consecutive chunks. */
  overlap?: number;
  /** Override the instance-wide embedding model for this field. */
  embedding_model?: string;
}

/**
 * AI-driven processing for a `type: 'file'` field. Authoring-side metadata
 * only — stripped from the wire schema; the server reads it from the app
 * registry to drive the behind-the-scenes index pipeline on upload. Both
 * options require a configured AI provider (see `server/ai/config`).
 */
export interface FileAiOptions {
  /**
   * Extract the file's full text (vision/OCR model) into an auto-synthesized
   * companion string field named `<field>_text`. The companion exists only in
   * the wire schema — it is not a writable field apps or the chat model set.
   */
  extract_text?: boolean;
  /**
   * Chunk the extracted text and store vector embeddings so the AI chat can
   * answer semantic questions across records. Implies `extract_text` (you
   * can't embed text you haven't extracted). `true` uses the instance
   * defaults; an object tunes chunking / the embedding model.
   */
  embed?: boolean | EmbedOptions;
}

/**
 * Behavior when a referenced record is deleted while this reference still
 * points at it. Declared metadata only for now — the engine does not yet
 * enforce referential integrity; wiring these into the delete path is the
 * planned follow-up. Declaring one today documents intent and lets apps
 * annotate fully ahead of enforcement.
 */
export type ReferenceOnDelete = 'restrict' | 'cascade' | 'set-null';

/**
 * Marks a string field as a **resource reference**: its value is the id of a
 * record of `resource` (the `{plural}/{id}` path convention some fields use is
 * still just the id in the stored value). Authoring-side metadata — like
 * `enum`, it is stripped from the wire schema and folded into the wire
 * `description` (aepbase preserves `description`, not custom keywords), so it
 * survives round-trip without an aepbase extension.
 *
 * Machine-readable consumers read the structured form: the chat tool builder
 * tells the model exactly which resource an id belongs to (and which read tool
 * finds one), and future work can enforce referential integrity and resolve
 * references in the UI.
 *
 * For a to-many reference, annotate the array's `items` (a string), not the
 * array field itself. Mutually exclusive with `enum`.
 */
export interface ResourceReference {
  /**
   * Kebab-case singular of the referenced resource, e.g. `person`. Must name a
   * declared resource, or the built-in `user` root; the schema sync validates
   * this across all definitions at boot and fails fast on an unknown target.
   */
  resource: string;
  /** Delete-time behavior — declared only, not yet enforced. See {@link ReferenceOnDelete}. */
  onDelete?: ReferenceOnDelete;
}

/**
 * A single field on a resource. Translated to a JSON-schema property
 * (`JsonSchemaProperty`) by `translate.ts` before being sent to aepbase.
 */
export interface FieldDef {
  type: FieldType;
  /**
   * Display name for a single value of this field (e.g. for generated
   * UI labels). Authoring-side metadata only — stripped from the wire
   * schema.
   */
  singular_name?: string;
  /** Display name for multiple values. Stripped from the wire schema. */
  plural_name?: string;
  description?: string;
  /** JSON-schema format hint, e.g. `date-time`. String fields only. */
  format?: string;
  /**
   * Inclusive lower bound for a `number`/`integer` field (JSON-schema
   * `minimum`). Unlike `enum`, the standard numeric/string/array assertion
   * keywords survive as first-class OpenAPI values (the generator passes them
   * through structurally), so they are both self-documenting in `/openapi.json`
   * and enforced by the engine at write time. Number fields only.
   */
  minimum?: number;
  /** Inclusive upper bound for a `number`/`integer` field. Number fields only. */
  maximum?: number;
  /** Exclusive lower bound — the value must be strictly greater. Number fields only. */
  exclusiveMinimum?: number;
  /** Exclusive upper bound — the value must be strictly less. Number fields only. */
  exclusiveMaximum?: number;
  /** The value must be an exact multiple of this (positive) number. Number fields only. */
  multipleOf?: number;
  /** Minimum length (in Unicode code points) of a `string` field. String fields only. */
  minLength?: number;
  /** Maximum length (in Unicode code points) of a `string` field. String fields only. */
  maxLength?: number;
  /** ECMAScript regular expression the `string` value must match. String fields only. */
  pattern?: string;
  /** Minimum number of elements in an `array` field. Array fields only. */
  minItems?: number;
  /** Maximum number of elements in an `array` field. Array fields only. */
  maxItems?: number;
  /** When true, all elements of an `array` field must be distinct. Array fields only. */
  uniqueItems?: boolean;
  /**
   * Allowed values for a string field. aepbase strips JSON-schema
   * `enum` on round-trip, so the translator encodes the values into the
   * wire description (`one of: a, b`) instead; the chat tool builder
   * passes them to Gemini as a real enum.
   */
  enum?: readonly string[];
  /**
   * Marks this (string) field as a reference to another resource — see
   * {@link ResourceReference}. Only valid on `string` fields; for a to-many
   * reference, annotate the array's `items`. Mutually exclusive with `enum`.
   */
  reference?: ResourceReference;
  /**
   * Whether the field is required on create. The translator collects
   * `required: true` fields into the JSON-schema `required` array.
   * @default false
   */
  required?: boolean;
  /**
   * Marks a field as on its way out. The column and its data are **kept** — a
   * deprecated field is still a declared field, so the schema sync never drops
   * it — but consumers stop steering writes to it: the chat tool builder omits
   * it from the create/update tools, and the note is folded into the wire
   * `description`. This is the intermediate state for retiring a field you can't
   * migrate-and-delete in one shot: deprecate it (keeping the data) in one
   * release, move the data off it with a migration, then remove it — authorized
   * by that migration's `drops` — in a later release. Not valid together with
   * `required` (you can't require a field you're retiring).
   * @default false
   */
  deprecated?: boolean;
  /**
   * Settable once, at create, and refused on every later write. The engine
   * rejects an update or full-replace carrying this field with a 400 rather
   * than silently dropping it — a caller that believes it changed something is
   * worse off than one told it can't (the chat tool builder derives
   * `update_<resource>` params from these fields, so a model *will* try).
   *
   * Distinct from the wire-level `readOnly`, which `preparePayload` strips on
   * create too, for values a client may never set at all.
   *
   * Use for a field whose whole meaning is "decided when this record came into
   * existence": a row's visibility (see the per-record access model), the
   * period a redemption belongs to, the email a document was ingested from.
   * @default false
   */
  immutable?: boolean;
  /**
   * Default value applied by the engine when the field is omitted from a
   * create (or full-replace apply) request. Encoded into the wire schema's
   * standard JSON-schema `default` keyword (which aepbase preserves on
   * round-trip, unlike `enum`). Not valid on `file` fields, and must match
   * the field's declared `type`.
   */
  default?: unknown;
  /**
   * Default this field to the current value of a household **app flag**,
   * resolved live by the engine at create / full-replace time when the field
   * is omitted. Unlike a static {@link default} (a fixed literal baked into the
   * schema), the value is read from the `app-flags` singleton on every write,
   * so *every* create path — the chat CRUD tools, cron hooks, image import, and
   * the UI alike — inherits the same household default without each having to
   * know the flag exists. A blank flag means "no default": the field stays
   * unset. String fields only; mutually exclusive with {@link default} and
   * {@link enum}, but composes with {@link reference} (a default store id is
   * still a store reference). See `homestead-server/src/engine/defaults.ts`.
   */
  defaultFromFlag?: { app: string; key: string };
  /** Element type for `array` fields. */
  items?: FieldDef;
  /** Nested fields for `object` fields. */
  properties?: Record<string, FieldDef>;
  /**
   * Name of the discriminator property for a tagged-union `object` field.
   * Required whenever `variants` is declared, and vice versa.
   *
   * OpenAPI requires the discriminator property be **defined in, and required
   * by, each variant** — it cannot reference a sibling field. The translator
   * injects it into every variant automatically, so variants must not declare
   * it themselves.
   */
  discriminator?: string;
  /**
   * Tagged-union variants for an `object` field, keyed by discriminator value
   * (kebab-case). Translated to OpenAPI `oneOf` + `discriminator` + `mapping`.
   *
   * Because every variant's fields are flattened into one generated column per
   * distinct field name, a field name used by more than one variant must
   * declare the same `type` in each — the translator fails the build otherwise.
   *
   * @example
   *   metadata: {
   *     type: 'object',
   *     discriminator: 'doc_type',
   *     variants: {
   *       'form-1099-int': { payer_name: { type: 'string' } },
   *       'form-w2':       { employer:   { type: 'string' } },
   *     },
   *   }
   */
  variants?: Record<string, Record<string, FieldDef>>;
  /**
   * AI processing for a `file` field: extract its text and/or embed it for
   * semantic search. Only valid on `type: 'file'`. See {@link FileAiOptions}.
   */
  ai?: FileAiOptions;
}

// ----------------------------------------------------------------------------
// Wire format — what aepbase's /aep-resource-definitions accepts
// ----------------------------------------------------------------------------

export type JsonSchemaPrimitive =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'binary';

/**
 * OpenAPI discriminator object. `propertyName` must name a property that every
 * variant defines and requires; `mapping` points each tag value at the
 * `components.schemas` entry the OpenAPI generator hoists that variant into.
 */
export interface JsonSchemaDiscriminator {
  propertyName: string;
  mapping?: Record<string, string>;
}

export interface JsonSchemaProperty {
  type: JsonSchemaPrimitive;
  description?: string;
  format?: string;
  /**
   * Standard JSON-schema / OpenAPI 3.1 assertion keywords. Unlike `enum` (which
   * aepbase strips, hence the description-fold), these round-trip as first-class
   * OpenAPI values, so the translator emits them verbatim and the engine
   * enforces them at write time. Emitted only for the type each applies to.
   */
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  /** Default applied by the engine when the field is omitted on create. */
  default?: unknown;
  /**
   * Allowed values. Only emitted for a variant's discriminator tag, where a
   * single-value enum pins the variant — aepbase strips `enum` from *top-level*
   * properties (hence the `one of: a, b` description encoding), but preserves
   * it inside `oneOf` variants, which is what makes the tag work.
   */
  enum?: readonly string[];
  /** Tagged-union variants. Always paired with {@link discriminator}. */
  oneOf?: JsonSchemaProperty[];
  discriminator?: JsonSchemaDiscriminator;
  /**
   * aepbase experimental marker for binary fields backed by uploaded
   * files. Produced by the translator from `type: 'file'` fields. See
   * `aepbase/main.go` (EnableFileFields).
   */
  'x-aepbase-file-field'?: boolean;
  /**
   * Structured resource-reference marker, produced by the translator from a
   * field's `reference` annotation. Unlike the human-readable description note
   * (which every reference also gets), this machine-readable form is what the
   * engine reads to enforce `onDelete` at delete time. For a to-many reference
   * the marker sits on the array's `items`. See
   * `homestead-server/src/engine/references.ts`.
   */
  'x-aepbase-reference'?: { resource: string; onDelete?: ReferenceOnDelete };
  /**
   * Marks a field whose default is sourced *live* from another collection's
   * field — the household `app-flags` singleton. Produced by the translator
   * from a field's `defaultFromFlag`. `resource` is the source collection's
   * plural, `field` its flattened column; on create (or full-replace) the
   * engine reads that column off the collection's single row and fills this
   * field when it's absent from the request. See
   * `homestead-server/src/engine/defaults.ts`.
   */
  'x-aepbase-default-from'?: { resource: string; field: string };
  /**
   * Marks an extracted-text companion column so the engine encrypts it at
   * rest (see `homestead-server/src/engine/store.ts`). Added by the
   * translator to each `<field>_text` companion.
   */
  'x-aepbase-file-text-field'?: boolean;
  /**
   * Marks a create-only field, produced by the translator from a field's
   * `immutable` annotation. The engine refuses an update or full-replace that
   * carries it (see `homestead-server/src/engine/validate.ts`).
   */
  'x-aepbase-immutable'?: boolean;
}

export interface ResourceSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

// ----------------------------------------------------------------------------
// Custom methods (AEP-136)
// ----------------------------------------------------------------------------

/**
 * HTTP method a custom method accepts. AEP-136 custom methods are POST by
 * default (they may have side effects); read-only ones may use GET.
 */
export type CustomMethodHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Whether a custom method hangs off the whole collection or a single item.
 *
 * - `collection` → `POST /<plural>:<verb>` (the default). Use for methods
 *   that don't target one existing record, e.g. `grocery-items:process-image`.
 * - `item`       → `POST /<plural>/<id>:<verb>`. The dispatcher exposes the
 *   addressed id on the handler context as `ctx.id`.
 *
 * See https://aep.dev/136/.
 */
export type CustomMethodTarget = 'collection' | 'item';

/**
 * Authenticated caller handed to a custom-method handler. Mirrors the
 * `AuthResult` returned by `core/server/aepbase#authenticate` — kept inline
 * so the resource-contract types stay free of server-only runtime imports.
 *
 * Custom methods always run authenticated, so this is never null.
 */
export interface CustomMethodAuth {
  token: string;
  user: {
    id: string;
    path: string;
    email: string;
    display_name?: string;
    type?: string;
  };
}

/**
 * Context passed to a custom-method handler when the dispatcher invokes it.
 */
export interface CustomMethodContext {
  request: Request;
  /** Authenticated caller — custom methods always require auth. */
  auth: CustomMethodAuth;
  /** Plural of the resource the method lives on, e.g. `grocery-items`. */
  plural: string;
  /** The custom verb being invoked, e.g. `process-image`. */
  verb: string;
  /** `collection` or `item`, matching the method's declared `target`. */
  target: CustomMethodTarget;
  /** Addressed record id — only set for `item`-target methods. */
  id?: string;
  /**
   * Parent chain as alternating `[plural, id, plural, id, ...]` segments
   * when the method lives on a nested resource. Empty for top-level ones.
   */
  parent?: string[];
  /**
   * Append a status/progress entry to the operation's log (`metadata.logs`),
   * surfaced as the operation's current status in the Operations app. Present
   * **only for async (AEP-151) methods** — sync methods and the pre-flight
   * `validate` check have no operation, so call it as `ctx.log?.(...)`. Never
   * throws; safe to `await` or ignore. The dispatcher brackets the run with
   * `started` and terminal `succeeded` / `failed: …` entries automatically.
   */
  log?: (message: string) => Promise<void>;
}

export type CustomMethodHandler = (
  ctx: CustomMethodContext,
) => Promise<Response>;

/**
 * Handler for an **async** (AEP-151) custom method. Unlike a sync handler it
 * doesn't return a `Response`: the dispatcher has already replied `202` with a
 * pending Operation. Instead it runs the real work in the background — the
 * value it resolves to becomes the operation's `response`, and anything it
 * throws becomes the operation's `error`.
 */
export type AsyncCustomMethodHandler = (
  ctx: CustomMethodContext,
) => Promise<unknown>;

/** Either handler shape — resolved from a method's lazy `load()`. */
export type AnyCustomMethodHandler =
  | CustomMethodHandler
  | AsyncCustomMethodHandler;

/**
 * Optional pre-flight check for an **async** method, exported as `validate`
 * alongside the handler.
 *
 * AEP-151: errors that stop the operation from *starting* must surface as
 * ordinary error responses, not as a `202` followed by a failed operation.
 * Return a `Response` to reject the call outright (no operation is created);
 * return nothing to let it proceed. Use it for preconditions and request
 * validation (missing config → 503, bad body → 400).
 */
export type AsyncCustomMethodValidator = (
  ctx: CustomMethodContext,
) => Promise<Response | void>;

/**
 * Declarative definition of a single custom method living on a resource.
 *
 * The handler is referenced via a lazy `import()` so the server-only runtime
 * code stays out of the client bundle when `resources.ts` is loaded by client
 * components (the production build stubs these `methods/*` imports).
 *
 * Custom methods always require an authenticated caller — there is no opt-out.
 *
 * @example
 *   customMethods: {
 *     'process-image': {
 *       target: 'collection',
 *       load: () => import('./methods/process-image'),
 *     },
 *   }
 */
export interface ResourceCustomMethod {
  /** Collection- vs item-scoped. Defaults to `'collection'`. */
  target?: CustomMethodTarget;
  /** HTTP method this custom method accepts. Defaults to `'POST'`. */
  method?: CustomMethodHttpMethod;
  /**
   * When true, this is an AEP-151 **long-running** method: the dispatcher
   * creates an Operation, replies `202` with it immediately, and runs the
   * handler in the background (its resolved value → `response`, a throw →
   * `error`). The handler's default export must be an
   * {@link AsyncCustomMethodHandler}. Defaults to `false` (synchronous).
   */
  async?: boolean;
  /**
   * Human-readable label for the operation this method spawns, shown in the
   * (superuser-only) Operations app (e.g. `'Parse receipt'`). Async methods
   * only; defaults to the `plural:verb` method name.
   */
  title?: string;
  /**
   * Human-readable description emitted onto the generated OpenAPI path for this
   * method (AEP-136). Optional — custom methods work without it, but declaring
   * it (plus {@link request}/{@link response}) makes the method self-describing
   * in `/openapi.json` instead of only in the `/api/custom-methods` shim.
   */
  description?: string;
  /**
   * JSON Schema for the request body, emitted as the `requestBody` schema on the
   * generated OpenAPI path. Omit for methods that take no body. Written as raw
   * JSON Schema (the same wire shape the engine emits), not the authoring
   * `FieldDef` map.
   */
  request?: Record<string, unknown>;
  /**
   * JSON Schema for the success response body. Emitted as the `200` response
   * schema (sync methods) or the `x-aep-long-running-operation.response` schema
   * (async methods). Omit to fall back to a generic object.
   */
  response?: Record<string, unknown>;
  /**
   * Lazy import of the handler app. The dispatcher awaits this on demand
   * and invokes the default export — a {@link CustomMethodHandler} for sync
   * methods, or an {@link AsyncCustomMethodHandler} when `async` is true.
   * Async modules may additionally export a {@link AsyncCustomMethodValidator}
   * as `validate` to reject bad calls before an operation is created.
   */
  load: () => Promise<{
    default: AnyCustomMethodHandler;
    validate?: AsyncCustomMethodValidator;
  }>;
}

/**
 * How a resource's rows are scoped to people.
 *
 * Omitted means `shared` — today's behavior for every resource that isn't
 * user-parented. The model decides only what filter (if any) the seeded
 * household roles put on their collection grant; enforcement itself is
 * unchanged, because the engine already unions the caller's own `_owner` rows
 * with anything a grant filter matches (see `engine/enforce.ts`
 * `visibilityToSql`).
 *
 * See `packages/homestead-site/docs/design/record-visibility.md`.
 */
export type ResourceAccess =
  /** Household-wide: every member reads and writes every row. */
  | { model: 'shared' }
  /**
   * Every row belongs to whoever created it and is reachable by others only
   * through an explicit grant. The grant filter is always `created_by ==
   * subject.id`, whose real job is authorizing CREATE — row visibility for the
   * owner comes from the engine-set `_owner`.
   */
  | { model: 'private' }
  /**
   * Each row carries its own visibility in a declared, immutable field. The
   * household role's grant is filtered `<field> == <sharedValue>`, which the
   * engine unions with the caller's `_owner` rows — so one collection holds
   * both private and household rows without forking into two resources.
   */
  | {
      model: 'per-record';
      /** snake_case name of the discriminator field, declared in `fields`. */
      field: string;
      /** The value meaning "the whole household". Builds the grant filter. */
      sharedValue: string;
      /** The value meaning "only its owner". */
      privateValue: string;
    };

/**
 * How long a resource's rows are kept. A daily core cron
 * (`resource-retention`, on the Operations app) deletes every row older than
 * the window — with its child subtree — through the normal API, so reference
 * rules and the change feed apply as for any delete. See `./retention`.
 */
export interface ResourceRetention {
  /** Keep a row this many days, measured from {@link field}. A positive integer. */
  days: number;
  /**
   * What to measure from. Omit for `update_time`, the engine-managed time of
   * the last write. `create_time` measures from creation. Or name a declared
   * `date-time` field — e.g. a conversation's `last_message_at` — holding UTC
   * ISO 8601 strings (what `toISOString()` writes); a row whose field is unset
   * falls back to `update_time`.
   */
  field?: string;
  /**
   * Only rows matching this list filter are ever swept — e.g. `done == true`,
   * so a still-running operation is never deleted however old. Same grammar as
   * a list's `filter`. A filter the engine rejects deletes nothing: the sweep
   * reports the failure in its operation log.
   */
  where?: string;
}

export interface ResourceDefinition {
  /** Kebab-case singular form, e.g. `gift-card`. Globally unique. */
  singular: string;
  /** Kebab-case plural form, e.g. `gift-cards`. */
  plural: string;
  description?: string;
  user_settable_create?: boolean;
  /**
   * When true, only superusers may create, update, or delete records of
   * this resource; regular users still read within their normal scope
   * (e.g. a user-parented resource stays readable by its owner). Used to
   * lock down `account-tag`, which gates app access and so must not be
   * self-editable. Persisted and enforced by the engine — see
   * `checkSuperuserWrite` in `homestead-server/src/engine/crud.ts`.
   */
  superuser_write?: boolean;
  /**
   * Singulars of parent resources. The runner topologically sorts by
   * this so parents apply before children. `'user'` is treated as a
   * built-in root (provided by aepbase's EnableUsers).
   *
   * A parented resource **inherits its access** from its parent: a record is
   * reachable by whoever may reach the parent record (read to see it, write to
   * add, change, or remove it), so sharing a gift card shares its transactions.
   * Under `user` that is the familiar rule — only that user (and superusers).
   * Opt out with {@link independent_access}. See
   * `packages/homestead-site/docs/design/parent-access-inheritance.md`.
   */
  parents?: string[];
  /**
   * Opt a parented resource out of access inheritance: authorize its rows on
   * their own owner and grants, as a top-level resource is. For a child whose
   * rows are governed independently of the parent (e.g. `group-membership`,
   * part of the self-governing permission model). Invalid without a parent,
   * and under `user`, whose subtree is always scoped by path.
   */
  independent_access?: boolean;
  /**
   * The resource's fields, keyed by snake_case field name. Translated
   * to the JSON-schema wire format (`ResourceSchema`) by the schema
   * sync — apps never write JSON schema directly.
   */
  fields: Record<string, FieldDef>;
  /**
   * AEP-136 custom methods that live on this resource, keyed by their
   * kebab-case verb (e.g. `process-image`). Server-only: stripped from the
   * payload sent to aepbase during schema sync and dispatched by the sidecar
   * gateway instead. See `core/resources/custom-methods/dispatcher.ts`.
   */
  customMethods?: Record<string, ResourceCustomMethod>;
  /**
   * Opt this resource into bulk import. The registry synthesizes a
   * `<plural>:bulk-import` custom method from the declaration, so it needs no
   * entry in `customMethods` and no per-app handler or page. Server-only, and
   * stripped from the schema-sync payload alongside `customMethods`. See
   * `core/resources/bulk-import/types.ts`.
   */
  bulkImport?: BulkImportDef<any>;
  /**
   * Opt this resource into bulk export — the mirror of {@link bulkImport}. The
   * registry synthesizes a read-only `GET /<plural>:bulk-export` custom method
   * from the declaration, so it needs no entry in `customMethods` and no per-app
   * handler or page. Server-only, and never reaches aepbase (the schema-sync
   * wire payload is an explicit whitelist). See
   * `core/resources/bulk-export/types.ts`.
   */
  bulkExport?: BulkExportDef<any>;
  /**
   * Delete rows past an age (see {@link ResourceRetention}). Top-level and
   * user-parented resources only: a child of anything else goes when its
   * parent does. Server-only — never
   * sent to the engine (the schema-sync wire payload is an explicit
   * whitelist). Validated at boot by `validateResourceDefinition`.
   */
  retention?: ResourceRetention;
  /**
   * Which model-facing tool surfaces offer this resource. Both default to
   * `true`; set one to `false` to hide the resource there:
   *
   *  - `chat` — the built-in assistant's tools (`POST /api/chat`)
   *  - `mcp`  — every `/api/mcp` surface, its catalog, and its document search
   *
   * Hiding a resource hides its descendants too, since they can't be addressed
   * without it. This is **not** a permission: the REST API, the CLI, and bulk
   * export are unaffected, and anything a model could reach it can still reach
   * the same way a person can. It only decides what a model is handed. See
   * `./model-tools`.
   */
  modelTools?: { chat?: boolean; mcp?: boolean };
  /**
   * Row-scoping model (see {@link ResourceAccess}). Omit for `shared`.
   * Validated at boot by `validateResourceDefinition`.
   *
   * On a child that inherits its access (see {@link parents}) the engine never
   * consults its own row grants, so `access` only shapes the household grant
   * seeded for the client-side `can()` mirror (which drives app visibility).
   * `per-record` is therefore invalid there: its discriminator would decide
   * nothing.
   */
  access?: ResourceAccess;
}
