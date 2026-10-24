/**
 * In-memory resource registry — port of the Go State (pkg/aepbase/aepbase.go)
 * minus the middleware/plugin machinery. Features (users, file fields) are
 * always on. The only custom methods the engine serves are the built-ins:
 * `:download` on file-field resources and `:login`/`:logout` on users —
 * app-declared custom methods are dispatched by the gateway before requests
 * reach the engine.
 */

import type { Database } from './sqlite';
import {
  addColumn,
  columnHasValues,
  backfillOwnerFromCreatedBy,
  createResourceTable,
  derivedColumnsFromSchema,
  dropResourceTable,
  ensureOwnerColumn,
  removeColumns,
  schemaTypeToSQLite,
  userColumnsFromSchema,
  type ColumnDef,
} from './db';
import { nestedFileFieldNames } from './file-entries';
import type { ResourceDefinition, Schema, SchemaProperty } from './types';
import { STANDARD_FIELDS } from './types';
import type { SyncDispatcher } from '../sync';

export const USER_SINGULAR = 'user';
export const USER_PLURAL = 'users';

export interface RegisteredResource {
  singular: string;
  plural: string;
  parents: string[];
  /** Schema including the standard id/path/create_time/update_time fields. */
  schema: Schema;
  singleton: boolean;
  enums: Record<string, string[]>;
  fileFields: Set<string>;
  /**
   * Top-level fields with files below them — in a list, inside an object.
   * Derived from the schema; those files are stored by id (see `./file-entries`).
   */
  nestedFileFields: Set<string>;
  description: string;
  examples: Record<string, unknown>;
  userSettableId: boolean;
  /** Only superusers may create/update/delete records of this resource. */
  superuserWrite: boolean;
  /**
   * Opted out of parent access inheritance: rows are authorized on their own
   * owner and grants. False (the default) means a parented resource's access
   * comes from its governing ancestor — see `./inherit`.
   */
  independentAccess: boolean;
  /** Built-in resources (user) have no _aep_resource_definitions row. */
  builtin: boolean;
  /**
   * URL pattern segments, e.g. ["publishers", "{publisher_id}", "books",
   * "{book_id}"]. Odd positions are `{param}` markers. Always plural-based,
   * including for singletons (their served route differs — see
   * singletonRouteElems).
   */
  patternElems: string[];
}

function paramName(singular: string): string {
  return `${singular.replaceAll('-', '_')}_id`;
}

function withStandardFields(schema: Schema, singleton: boolean): Schema {
  const properties: Record<string, SchemaProperty> = { ...schema.properties };
  if (!singleton) {
    properties.id = { type: 'string', readOnly: true };
  }
  properties.path = { type: 'string', readOnly: true };
  properties.create_time = { type: 'string', format: 'date-time', readOnly: true };
  properties.update_time = { type: 'string', format: 'date-time', readOnly: true };
  return { ...schema, properties };
}

export class Registry {
  readonly db: Database;
  readonly filesDir: string;
  /** Base URL used when echoing file-field download URLs in responses. */
  readonly serverUrl: string;
  private resources = new Map<string, RegisteredResource>();
  /**
   * Optional post-commit resource-sync dispatcher. Set by the {@link Engine} at
   * construction and reached by the CRUD handlers (which already receive the
   * registry) to fire a mirror after a write. Optional so call sites and tests
   * that never wire a dispatcher behave identically. Fire-and-forget — see
   * {@link SyncDispatcher}.
   */
  syncDispatcher: SyncDispatcher | null = null;

  constructor(db: Database, opts: { filesDir: string; serverUrl: string }) {
    this.db = db;
    this.filesDir = opts.filesDir;
    this.serverUrl = opts.serverUrl;

    // The built-in user resource: routes are served by users.ts, but the
    // registry entry lets dynamic resources declare `parents: ['user']` and
    // gives the OpenAPI generator its schema.
    this.resources.set(USER_SINGULAR, {
      singular: USER_SINGULAR,
      plural: USER_PLURAL,
      parents: [],
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', readOnly: true },
          path: { type: 'string', readOnly: true },
          email: { type: 'string' },
          display_name: { type: 'string' },
          type: { type: 'string' },
          create_time: { type: 'string', format: 'date-time', readOnly: true },
          update_time: { type: 'string', format: 'date-time', readOnly: true },
        },
      },
      singleton: false,
      enums: {},
      fileFields: new Set(),
      nestedFileFields: new Set(),
      description: '',
      examples: {},
      userSettableId: false,
      superuserWrite: false,
      independentAccess: false,
      builtin: true,
      patternElems: [USER_PLURAL, `{${paramName(USER_SINGULAR)}}`],
    });
  }

  get(singular: string): RegisteredResource | undefined {
    return this.resources.get(singular);
  }

  has(singular: string): boolean {
    return this.resources.has(singular);
  }

  all(): RegisteredResource[] {
    return [...this.resources.values()];
  }

  /** Dynamic (non-builtin) resources, for routing. */
  dynamic(): RegisteredResource[] {
    return this.all().filter((r) => !r.builtin);
  }

  children(singular: string): RegisteredResource[] {
    return this.all().filter((r) => r.parents.includes(singular));
  }

  /** Whether "user" appears anywhere in the resource's parent chain. */
  hasUserParent(r: RegisteredResource): boolean {
    for (const p of r.parents) {
      if (p === USER_SINGULAR) return true;
      const parent = this.resources.get(p);
      if (parent && this.hasUserParent(parent)) return true;
    }
    return false;
  }

  /** Singleton route segments: parent pattern + the singular name. */
  singletonRouteElems(r: RegisteredResource): string[] {
    const parts: string[] = [];
    if (r.parents.length > 0) {
      const parent = this.resources.get(r.parents[0]!);
      if (parent) parts.push(...parent.patternElems);
    }
    parts.push(r.singular);
    return parts;
  }

  private buildPatternElems(def: {
    singular: string;
    plural: string;
    parents: string[];
  }): string[] {
    const elems: string[] = [];
    if (def.parents.length > 0) {
      const parent = this.resources.get(def.parents[0]!);
      if (parent) elems.push(...parent.patternElems);
    }
    elems.push(def.plural, `{${paramName(def.singular)}}`);
    return elems;
  }

  /** Register a resource: create its table and expose its routes. */
  addResource(def: ResourceDefinition): void {
    const parents = def.parents ?? [];
    for (const parentSingular of parents) {
      if (!this.resources.has(parentSingular)) {
        throw new Error(`parent resource "${parentSingular}" not found`);
      }
    }

    const fileFields = new Set(def.file_fields ?? []);

    const columns = userColumnsFromSchema(def.schema);
    createResourceTable(this.db, def.plural, parents, columns);
    // Permissions Phase 0: ensure the engine-managed owner column exists on
    // pre-existing tables, then one-time-backfill it from `created_by`.
    ensureOwnerColumn(this.db, def.plural);
    backfillOwnerFromCreatedBy(
      this.db,
      def.plural,
      Boolean(def.schema.properties?.created_by),
    );

    this.resources.set(def.singular, {
      singular: def.singular,
      plural: def.plural,
      parents,
      schema: withStandardFields(def.schema, def.singleton ?? false),
      singleton: def.singleton ?? false,
      enums: def.enums ?? {},
      fileFields,
      nestedFileFields: nestedFileFieldNames(def.schema),
      description: def.description ?? '',
      examples: def.examples ?? {},
      userSettableId: def.user_settable_create ?? false,
      superuserWrite: def.superuser_write ?? false,
      independentAccess: def.independent_access ?? false,
      builtin: false,
      patternElems: this.buildPatternElems({
        singular: def.singular,
        plural: def.plural,
        parents,
      }),
    });
  }

  /** Unregister a resource and drop its table. Fails if children depend on it. */
  removeResource(singular: string): void {
    const r = this.resources.get(singular);
    if (!r) throw new Error(`resource "${singular}" not found`);
    const children = this.children(singular);
    if (children.length > 0) {
      const names = children.map((c) => c.singular);
      throw new Error(
        `cannot delete resource "${singular}": children depend on it: [${names.join(' ')}]`,
      );
    }
    dropResourceTable(this.db, r.plural);
    this.resources.delete(singular);
  }

  /**
   * Apply a schema update: add new columns, drop removed ones (table
   * recreate), reject type changes. Mirrors State.UpdateResourceSchema.
   *
   * A field that disappears from the definition drops its column — and its
   * data. Dropping a **populated** column is refused unless its name is in
   * `authorizedDrops`, so an accidental field deletion (or a rename with no
   * data migration) can't silently destroy data at boot. The schema sync fills
   * `authorizedDrops` from migrations that declare a matching `drops` entry; an
   * empty column carries no data and drops freely regardless.
   */
  updateResourceSchema(
    def: ResourceDefinition,
    oldDef: ResourceDefinition,
    authorizedDrops: ReadonlySet<string> = new Set(),
  ): void {
    const r = this.resources.get(def.singular);
    if (!r) throw new Error(`resource "${def.singular}" not found`);

    const oldProps = oldDef.schema.properties ?? {};
    const newProps = def.schema.properties ?? {};

    const added: ColumnDef[] = [];
    const removed: string[] = [];
    for (const [name, prop] of Object.entries(newProps)) {
      const oldProp = oldProps[name];
      if (!oldProp) {
        added.push({ name, sqlType: schemaTypeToSQLite(prop.type) });
      } else if (prop.type !== oldProp.type) {
        throw new Error(
          `cannot change type of property "${name}" from "${oldProp.type}" to "${prop.type}"`,
        );
      }
    }
    for (const name of Object.keys(oldProps)) {
      if (!(name in newProps)) removed.push(name);
    }

    // Guard against silent data loss: a dropped column that still holds data
    // must be explicitly authorized (via a migration's `drops`). Empty columns
    // — a field added then removed before any write — drop without ceremony.
    const unauthorized = removed.filter(
      (name) => !authorizedDrops.has(name) && columnHasValues(this.db, def.plural, name),
    );
    if (unauthorized.length > 0) {
      throw new Error(
        `refusing to drop column(s) [${unauthorized.join(', ')}] from "${def.singular}": ` +
          `they still hold data. Restore the field, mark it \`deprecated: true\` to keep ` +
          `it, or authorize the drop with a destructive migration declaring ` +
          `drops: [${unauthorized
            .map((name) => `{ resource: '${def.singular}', field: '${name}' }`)
            .join(', ')}].`,
      );
    }

    // Tagged-union variant fields live inside an object property, so the
    // top-level diff above never sees them: adding a variant field leaves
    // `metadata`'s type untouched while requiring a new derived column. Diff
    // them separately, or `filter` would resolve a path whose column was never
    // created and fail at the SQL layer.
    const oldDerived = new Map(
      derivedColumnsFromSchema(oldDef.schema).map((c) => [c.name, c]),
    );
    const newDerived = new Map(
      derivedColumnsFromSchema(def.schema).map((c) => [c.name, c]),
    );
    // A redefined or dropped derived column can't be ALTERed in place; the
    // recreate below rebuilds every column from the new schema. The source blob
    // is copied verbatim, so redefining one is non-destructive.
    let rebuildDerived = false;
    for (const [name, col] of newDerived) {
      const prior = oldDerived.get(name);
      if (!prior) added.push(col);
      else if (
        prior.generatedFrom !== col.generatedFrom ||
        prior.sqlType !== col.sqlType
      ) {
        rebuildDerived = true;
      }
    }
    for (const name of oldDerived.keys()) {
      if (!newDerived.has(name)) rebuildDerived = true;
    }

    for (const col of added) {
      if (STANDARD_FIELDS.has(col.name)) continue;
      if (rebuildDerived && col.generatedFrom) continue; // the recreate covers it
      // A field promoted from a union variant to a real top-level field (a real
      // column always wins the name clash) already has a physical column in the
      // live table — it was that variant's derived column. Its disappearance
      // from newDerived forced rebuildDerived above, so the recreate redeclares
      // it as a real column and copies the data. ALTER ADD here would hit the
      // still-present derived column ("duplicate column name").
      if (oldDerived.has(col.name)) continue;
      addColumn(this.db, def.plural, col);
    }
    if (removed.length > 0 || rebuildDerived) {
      removeColumns(this.db, def.plural, def.parents ?? [], userColumnsFromSchema(def.schema));
    }

    r.schema = withStandardFields(def.schema, r.singleton);
    r.superuserWrite = def.superuser_write ?? false;
    r.independentAccess = def.independent_access ?? false;
    if (def.description) r.description = def.description;
    if (def.examples && Object.keys(def.examples).length > 0) r.examples = def.examples;
    // Enums and file fields are replaced wholesale on update.
    r.enums = def.enums && Object.keys(def.enums).length > 0 ? def.enums : {};
    r.fileFields = new Set(def.file_fields ?? []);
    r.nestedFileFields = nestedFileFieldNames(def.schema);
  }
}
