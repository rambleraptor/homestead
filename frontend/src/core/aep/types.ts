/**
 * Shared types for aepbase resource definitions.
 *
 * Mirrors the shape that the `aep_aep-resource-definition` Terraform
 * resource produced — `singular`, `plural`, `parents`,
 * `user_settable_create`, plus a JSON-schema-flavored `schema` block.
 * Both the apply-schema CLI and the e2e bootstrap consume these.
 *
 * aepbase rules to keep in mind when authoring (see CLAUDE.md):
 *   - `singular` / `plural` must be kebab-case (`gift-card`, not `giftCard`).
 *   - Field names must be snake_case.
 *   - JSON-schema `enum` / `minimum` / `maximum` are stripped on
 *     round-trip — encode allowed values in `description` instead.
 *   - File fields use `type: 'binary'` + `'x-aepbase-file-field': true`.
 *   - aepbase manages `create_time` / `update_time`; do not declare them.
 *   - `parents` cannot change after creation (delete + recreate to migrate).
 */

export type AepProperty =
  | { type: 'string'; description?: string; format?: string }
  | { type: 'number'; description?: string }
  | { type: 'boolean'; description?: string }
  | {
      type: 'binary';
      description?: string;
      'x-aepbase-file-field': true;
    }
  | {
      type: 'array';
      description?: string;
      items: AepProperty;
    }
  | {
      type: 'object';
      description?: string;
      properties?: Record<string, AepProperty>;
      required?: readonly string[];
    };

export interface AepResourceSchema {
  type: 'object';
  properties: Record<string, AepProperty>;
  required?: readonly string[];
}

export interface AepResourceDefinition {
  /** Kebab-case singular name, e.g. `gift-card`. */
  singular: string;
  /** Kebab-case plural name, e.g. `gift-cards`. */
  plural: string;
  description?: string;
  /** Whether non-superuser tokens may create instances. */
  user_settable_create?: boolean;
  /**
   * Parent singulars, in URL order. `['credit-card']` puts the
   * resource under `/credit-cards/{id}/<plural>/{id}`. Use `['user']`
   * to scope a resource to the built-in user resource.
   */
  parents?: readonly string[];
  /**
   * Map of property name → allowed string values. Aepbase enforces
   * these on write (returns 400 for unknown values) and round-trips
   * them on the resource definition. Property must be `type: 'string'`
   * in the schema. Used by `AepRecord<>` to narrow the inferred TS
   * type to a string-literal union.
   */
  enums?: Readonly<Record<string, readonly string[]>>;
  schema: AepResourceSchema;
}
