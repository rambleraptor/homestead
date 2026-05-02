/**
 * Shared types for aepbase resource definitions declared in TypeScript.
 *
 * Each module declares the schema for the aepbase collections it owns
 * via `HomeModule.resources`. The shape mirrors what aepbase's
 * `/aep-resource-definitions` endpoint accepts on POST/PATCH — see
 * `packages/homestead-core/resources/sync.ts` for the runner.
 */

export type JsonSchemaPrimitive =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'binary';

export interface JsonSchemaProperty {
  type: JsonSchemaPrimitive;
  description?: string;
  format?: string;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  /**
   * aepbase experimental marker for binary fields backed by uploaded
   * files. Pair with `type: 'binary'`. See
   * `aepbase/main.go` (EnableFileFields).
   */
  'x-aepbase-file-field'?: boolean;
}

export interface ResourceSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface ResourceDefinition {
  /** Kebab-case singular form, e.g. `gift-card`. Globally unique. */
  singular: string;
  /** Kebab-case plural form, e.g. `gift-cards`. */
  plural: string;
  description?: string;
  user_settable_create?: boolean;
  /**
   * Singulars of parent resources. The runner topologically sorts by
   * this so parents apply before children. `'user'` is treated as a
   * built-in root (provided by aepbase's EnableUsers).
   */
  parents?: string[];
  schema: ResourceSchema;
}
