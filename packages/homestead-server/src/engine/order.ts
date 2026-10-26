/**
 * AEP list-ordering (`order_by`) parser.
 *
 * The wire syntax follows aep.dev: a comma-separated list of fields, each
 * optionally prefixed with `-` for descending order (ascending is the
 * default). Redundant whitespace is insignificant (`"foo, -bar"` ==
 * `"foo,-bar"`). Subfields use a `.` (`metadata.box_1`) and resolve to the
 * derived column the DDL projected for that union path — the same resolution
 * `compileFilter` performs, so ordering seeks an index instead of scanning.
 *
 * Field names are validated against the schema and translated to SQL column
 * names, so the compiled clause never interpolates client input as an
 * identifier. Unknown fields throw `Error("invalid order_by: ...")`, which the
 * list handler maps to a 400 — the same contract as `compileFilter`.
 */

import { isEncryptedField } from './encrypted-fields';
import type { Schema } from './types';
import { STANDARD_FIELDS } from './types';
import { derivedColumnsFromSchema } from './db';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

class OrderError extends Error {}

/**
 * Compile an `order_by` value to a SQL fragment (without the `ORDER BY`
 * keyword), e.g. `"create_time,-merchant"` → `create_time ASC, merchant DESC`.
 * Returns `''` for an empty/whitespace-only value. Throws
 * `Error("invalid order_by: ...")` on an unknown field or malformed syntax.
 */
export function compileOrderBy(orderBy: string, schema: Schema): string {
  try {
    const fields = new Set(
      Object.keys(schema.properties ?? {}).filter((n) => !STANDARD_FIELDS.has(n)),
    );
    // Union paths (`metadata.doc_type`) resolve to their derived column.
    const derived = new Map(
      derivedColumnsFromSchema(schema).map((c) => [c.path, c.name]),
    );

    const terms: string[] = [];
    for (const raw of orderBy.split(',')) {
      const segment = raw.trim();
      if (segment === '') {
        // Ignore an empty value entirely; reject stray commas (`"foo,,bar"`).
        if (orderBy.trim() === '') return '';
        throw new OrderError('empty ordering field');
      }

      let dir = 'ASC';
      let name = segment;
      if (name.startsWith('-')) {
        dir = 'DESC';
        name = name.slice(1).trim();
      }
      if (name === '') throw new OrderError('empty ordering field');
      if (!IDENT.test(name)) {
        throw new OrderError(`invalid ordering field ${JSON.stringify(name)}`);
      }

      const column = STANDARD_FIELDS.has(name)
        ? name
        : fields.has(name)
          ? name
          : derived.get(name);
      if (!column) throw new OrderError(`unknown field ${JSON.stringify(name)}`);

      // Encrypted columns hold ciphertext, so ordering would sort
      // ciphertext — meaningless. Reject it, matching the filter compiler.
      if (isEncryptedField(schema, name)) {
        throw new OrderError(`field ${JSON.stringify(name)} is encrypted and cannot be ordered`);
      }

      terms.push(`${column} ${dir}`);
    }

    return terms.join(', ');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid order_by: ${msg}`);
  }
}
