/**
 * Derive TypeScript record types from `AepResourceDefinition`s.
 *
 * Goal: keep the schema and the in-app TS type in lockstep — change a
 * field in `<module>/resources.ts` and every consumer's type updates
 * automatically.
 *
 * We hand-roll the JSON-schema → TS mapping (~40 lines below) instead
 * of pulling in `json-schema-to-ts` because aepbase's schema dialect
 * has two homestead-specific wrinkles that fight a generic JSON-schema
 * library:
 *
 *   1. `binary` isn't a real JSON-schema type — aepbase uses it to flag
 *      file fields. On read, file fields surface as URL strings.
 *   2. `'x-aepbase-file-field': true`, snake_case fields, etc. — the
 *      shape is just enough JSON-schema for aepbase, not the whole
 *      Draft-2020 spec.
 *
 * Two things this deliberately does NOT do (and why):
 *
 *   - The write/form-data shape (file fields are `File | null` on
 *     write, `string` URLs on read). Hand-declare form types alongside.
 *
 * Enum support: the resource definition's `enums` map (e.g.
 * `enums: { transaction_type: ['decrement', 'set'] }`) is rendered as
 * a string-literal union on the matching field. Aepbase enforces the
 * constraint server-side, so the schema field stays `type: 'string'`.
 *
 * Usage:
 *
 *     export const giftCardResource = {
 *       singular: 'gift-card',
 *       plural: 'gift-cards',
 *       schema: { type: 'object', properties: { ... }, required: [...] },
 *     } as const satisfies AepResourceDefinition;
 *
 *     export type GiftCard = AepRecord<typeof giftCardResource>;
 */

import type {
  AepProperty,
  AepResourceDefinition,
  AepResourceSchema,
} from './types';

/**
 * Aepbase-managed fields present on every record returned from the API.
 */
export interface AepEnvelope {
  id: string;
  path: string;
  create_time: string;
  update_time: string;
}

/**
 * Map a single `AepProperty` to its read-side TS type.
 * `binary` becomes `string` (the URL aepbase returns on read).
 */
type AepValue<P> = P extends { type: 'string' }
  ? string
  : P extends { type: 'number' }
    ? number
    : P extends { type: 'boolean' }
      ? boolean
      : P extends { type: 'binary' }
        ? string
        : P extends { type: 'array'; items: infer I }
          ? AepValue<I>[]
          : P extends { type: 'object'; properties: infer Ps }
            ? Ps extends Record<string, AepProperty>
              ? AepObjectFromProps<Ps, readonly []>
              : Record<string, unknown>
            : P extends { type: 'object' }
              ? Record<string, unknown>
              : unknown;

/**
 * Build an object type from a `properties` map plus a `required`
 * tuple. Required keys are non-optional; everything else is optional.
 */
type AepObjectFromProps<
  Ps extends Record<string, AepProperty>,
  R extends readonly string[],
> = {
  -readonly [K in keyof Ps as K extends R[number] ? K : never]: AepValue<Ps[K]>;
} & {
  -readonly [K in keyof Ps as K extends R[number] ? never : K]?: AepValue<
    Ps[K]
  >;
};

/**
 * Convert a top-level `AepResourceSchema` into the matching TS type
 * (without the aepbase envelope — that's added by `AepRecord`).
 */
type FromSchema<S extends AepResourceSchema> = S extends {
  properties: infer Ps;
  required: infer R;
}
  ? Ps extends Record<string, AepProperty>
    ? R extends readonly string[]
      ? AepObjectFromProps<Ps, R>
      : never
    : never
  : S extends { properties: infer Ps }
    ? Ps extends Record<string, AepProperty>
      ? AepObjectFromProps<Ps, readonly []>
      : never
    : never;

/**
 * Narrow string fields whose name appears in the resource definition's
 * `enums` map to the corresponding string-literal union. Other fields
 * pass through unchanged. Optional modifiers are preserved by the
 * mapped type (the `?` rides along regardless of value-type changes).
 */
type ApplyEnums<Base, E> = {
  [K in keyof Base]: K extends keyof E
    ? E[K] extends readonly string[]
      ? E[K][number]
      : Base[K]
    : Base[K];
};

// `{}` (rather than `Record<string, never>`) is deliberate: `keyof {}`
// is `never`, so when a resource declares no `enums` map every field
// passes through `ApplyEnums` unchanged.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type EnumsOf<D> = D extends { enums: infer E } ? E : {};

/**
 * Read-side shape of one aepbase record, derived from its resource
 * definition. Includes the `AepEnvelope` fields aepbase manages and
 * narrows enum-constrained string fields to literal unions.
 */
export type AepRecord<D extends AepResourceDefinition> = AepEnvelope &
  ApplyEnums<FromSchema<D['schema']>, EnumsOf<D>>;
