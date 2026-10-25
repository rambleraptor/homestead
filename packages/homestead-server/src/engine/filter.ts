/**
 * Minimal list-filter parser. The Go server accepted CEL expressions; no
 * consumer ever passed a filter, so the TS engine supports the practical
 * subset — comparisons (==, !=, <, <=, >, >=) on schema fields combined with
 * && / || and parentheses — compiled to parameterized SQL.
 *
 * The `in` membership operator (AEP-160 defers to the CEL language definition)
 * has both standard `A in list(A)` forms:
 *   - `<value> in <array field>` tests whether a stored array column contains
 *     that scalar element, compiled to a `json_each` existence check.
 *   - `<field> in [<literal>, ...]` tests whether a field's value is one of a
 *     list literal, compiled to SQL `IN (?, ...)`. This is what lets a caller
 *     select an explicit set of records, e.g. `id in ["a", "b"]`.
 * Comprehension macros (`exists`/`all`) are not supported.
 *
 * `id` is filterable (it's the real primary-key column on every resource
 * table), which is what makes `id in [...]` selection work. So are
 * `create_time` and `update_time`: real columns on every table, stored as
 * second-precision UTC RFC 3339 strings (`2026-10-24T17:35:55Z`), so comparing
 * them as text compares them as instants — `update_time > "2026-10-17T00:00:00Z"`.
 * `path` stays non-filterable.
 *
 * `has(<field>)` is CEL's presence macro: true when the field is set (column
 * non-null), and for a repeated field only when it is also non-empty.
 *
 * CEL's string functions `<field>.contains("x")`, `.startsWith("x")` and
 * `.endsWith("x")` match part of a string field, compiled to `LIKE`. Unlike
 * CEL they ignore case (ASCII letters): people and models rarely type a name
 * the way it was stored, and "jake" should find "Jake Miller". The one
 * comprehension supported is `<array>.exists(v, <predicate on v>)` with a
 * single string function or `==` on `v`, so an array of strings (a person's
 * aliases) can be searched the same way.
 */

import type { Schema } from './types';
import { STANDARD_FIELDS } from './types';
import { derivedColumnsFromSchema } from './db';

export interface CompiledFilter {
  sql: string;
  params: (string | number)[];
}

type Token =
  | { kind: 'ident'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'op'; value: string };

class FilterError extends Error {}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === '[' || c === ']' || c === ',') {
      tokens.push({ kind: 'op', value: c });
      i++;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') {
      tokens.push({ kind: 'op', value: two });
      i += 2;
      continue;
    }
    if (c === '<' || c === '>') {
      tokens.push({ kind: 'op', value: c });
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const end = input.indexOf(c, i + 1);
      if (end === -1) throw new FilterError('unterminated string literal');
      tokens.push({ kind: 'string', value: input.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(input[i + 1] ?? ''))) {
      const m = /^-?\d+(\.\d+)?/.exec(input.slice(i))!;
      tokens.push({ kind: 'number', value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      // Dotted paths (`metadata.box_1_interest`) tokenize as one identifier;
      // parseOperand resolves them against a union field's derived columns.
      const m = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(
        input.slice(i),
      )!;
      const word = m[0];
      if (word === 'true' || word === 'false') {
        tokens.push({ kind: 'bool', value: word === 'true' });
      } else if (word === 'in') {
        // `in` is a CEL reserved word (the membership operator), never a field.
        tokens.push({ kind: 'op', value: 'in' });
      } else {
        tokens.push({ kind: 'ident', value: word });
      }
      i += word.length;
      continue;
    }
    throw new FilterError(`unexpected character ${JSON.stringify(c)}`);
  }
  return tokens;
}

/** CEL string functions → the `LIKE` pattern around the escaped value. */
const STRING_FUNCTIONS: Record<string, (v: string) => string> = {
  contains: (v) => `%${v}%`,
  startsWith: (v) => `${v}%`,
  endsWith: (v) => `%${v}`,
};

/** Escape `LIKE`'s wildcards so a value only ever matches itself. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** `name.contains` → `{ receiver: 'name', fn: 'contains' }`, when it's a call. */
function splitCall(ident: string): { receiver: string; fn: string } | null {
  const dot = ident.lastIndexOf('.');
  if (dot <= 0) return null;
  return { receiver: ident.slice(0, dot), fn: ident.slice(dot + 1) };
}

/** Types a string function can't be applied to (everything else is text). */
const NON_TEXT_TYPES = new Set(['integer', 'number', 'boolean', 'array', 'object']);

const COMPARISON_OPS: Record<string, string> = {
  '==': '=',
  '!=': '!=',
  '<': '<',
  '<=': '<=',
  '>': '>',
  '>=': '>=',
};

/**
 * Caller attributes a filter may reference as `subject.<attr>` (permissions
 * §3.6.1). Bound as SQL parameters, never interpolated. Only these keys are
 * addressable; anything else under `subject.` is an error.
 */
export interface FilterSubject {
  id: string;
  email?: string;
  display_name?: string;
}

const SUBJECT_KEYS = new Set<keyof FilterSubject>(['id', 'email', 'display_name']);

export interface CompileOptions {
  /**
   * Enables the `subject.*` operand namespace, bound to these values. Omitted by
   * the List endpoint (its `subject.*` then resolves as an unknown field → 400),
   * supplied by permission filter-grants.
   */
  subject?: FilterSubject;
}

/**
 * Compile a filter expression to a parameterized SQL fragment. Throws
 * Error("invalid filter: ...") on parse failures or unknown fields, which
 * the list handler maps to a 400 — same contract as the Go server.
 *
 * The single filter compiler shared by List and permission filter-grants: any
 * grammar added here lifts both. `opts.subject` is the one permission-specific
 * seam (List calls it with no opts).
 */
export function compileFilter(
  filter: string,
  schema: Schema,
  opts: CompileOptions = {},
): CompiledFilter {
  try {
    const tokens = tokenize(filter);
    const fields = new Set(
      Object.keys(schema.properties ?? {}).filter((n) => !STANDARD_FIELDS.has(n)),
    );
    // `id` is the primary-key column on every resource table, so it's safe to
    // filter on (unlike `path`, which stays excluded). This is what makes
    // `id in [...]` record selection expressible as a filter.
    fields.add('id');
    // The engine-managed timestamps are real columns too, written in one fixed
    // format (`nowRFC3339`), so a text comparison is a time comparison.
    fields.add('create_time');
    fields.add('update_time');
    // Union paths (`metadata.doc_type`) resolve to the derived column the DDL
    // generated for them, so a filter seeks an index instead of scanning.
    const derived = new Map(
      derivedColumnsFromSchema(schema).map((c) => [c.path, c.name]),
    );
    let pos = 0;

    const peek = () => tokens[pos];
    const peekAt = (ahead: number) => tokens[pos + ahead];
    const next = () => tokens[pos++];
    const expectOp = (value: string) => {
      const t = next();
      if (!t || t.kind !== 'op' || t.value !== value) {
        throw new FilterError(`expected ${JSON.stringify(value)}`);
      }
    };

    const params: (string | number)[] = [];

    const isColumn = (name: string) => fields.has(name) || derived.has(name);

    /** A field name → its column and declared type, or a 400 for anything else. */
    function resolveField(name: string): { sql: string; propType?: string } {
      const column = fields.has(name) ? name : derived.get(name);
      if (!column) {
        throw new FilterError(`unknown field ${JSON.stringify(name)}`);
      }
      // Extracted-text columns are encrypted at rest, so a SQL comparison
      // would match ciphertext and silently return nothing. Reject it.
      if (schema.properties?.[name]?.['x-aepbase-file-text-field'] === true) {
        throw new FilterError(`field ${JSON.stringify(name)} is encrypted and cannot be filtered`);
      }
      // propType is the declared type for a direct field; derived union
      // columns don't carry one (they're never arrays).
      const propType = fields.has(name) ? schema.properties?.[name]?.type : undefined;
      return { sql: column, propType };
    }

    /** `("value")` — a string function's one argument, bound as its pattern. */
    function parseStringArgument(fn: string): void {
      expectOp('(');
      const arg = next();
      if (arg?.kind !== 'string') {
        throw new FilterError(`${fn}() takes one string value`);
      }
      expectOp(')');
      params.push(STRING_FUNCTIONS[fn]!(escapeLike(arg.value)));
    }

    /**
     * `<field>.contains("x")` and friends, or `<array>.exists(v, <pred>)`.
     * Called with the call's identifier already consumed.
     */
    function parseCall(receiver: string, fn: string): string {
      if (fn in STRING_FUNCTIONS) {
        const field = resolveField(receiver);
        if (field.propType && NON_TEXT_TYPES.has(field.propType)) {
          throw new FilterError(`${fn}() needs a text field; ${JSON.stringify(receiver)} is not one`);
        }
        parseStringArgument(fn);
        return `${field.sql} LIKE ? ESCAPE '\\'`;
      }
      if (fn === 'exists') {
        const field = resolveField(receiver);
        if (field.propType !== 'array') {
          throw new FilterError(`exists() needs an array field; ${JSON.stringify(receiver)} is not one`);
        }
        expectOp('(');
        const variable = next();
        if (variable?.kind !== 'ident' || variable.value.includes('.')) {
          throw new FilterError('exists() takes a variable name first');
        }
        expectOp(',');
        const predicate = next();
        let sql: string;
        const call = predicate?.kind === 'ident' ? splitCall(predicate.value) : null;
        if (call && call.receiver === variable.value && call.fn in STRING_FUNCTIONS) {
          parseStringArgument(call.fn);
          sql = `value LIKE ? ESCAPE '\\'`;
        } else if (predicate?.kind === 'ident' && predicate.value === variable.value) {
          expectOp('==');
          const value = next();
          if (value?.kind !== 'string' && value?.kind !== 'number') {
            throw new FilterError('exists() compares its variable to a value');
          }
          params.push(value.value);
          sql = 'value = ?';
        } else {
          throw new FilterError(
            `exists() supports one test on ${variable.value}: ${variable.value}.contains("x"), ` +
              `.startsWith, .endsWith, or ${variable.value} == "x"`,
          );
        }
        expectOp(')');
        return `EXISTS (SELECT 1 FROM json_each(${field.sql}) WHERE ${sql})`;
      }
      throw new FilterError(`unknown function ${JSON.stringify(fn)}`);
    }

    function parseOperand(): { sql: string; isField: boolean; propType?: string } {
      const t = next();
      if (!t) throw new FilterError('unexpected end of filter');
      switch (t.kind) {
        case 'ident': {
          // `subject.<attr>` binds a caller attribute as a parameter, when a
          // subject context is supplied (permission filter-grants only).
          if (t.value.startsWith('subject.')) {
            const attr = t.value.slice('subject.'.length) as keyof FilterSubject;
            if (!opts.subject || !SUBJECT_KEYS.has(attr)) {
              throw new FilterError(`unknown field ${JSON.stringify(t.value)}`);
            }
            params.push(opts.subject[attr] ?? '');
            return { sql: '?', isField: false };
          }
          return { ...resolveField(t.value), isField: true };
        }
        case 'string':
          params.push(t.value);
          return { sql: '?', isField: false };
        case 'number':
          params.push(t.value);
          return { sql: '?', isField: false };
        case 'bool':
          params.push(t.value ? 1 : 0); // booleans are stored as 0/1
          return { sql: '?', isField: false };
        default:
          throw new FilterError(`unexpected token ${JSON.stringify(t.value)}`);
      }
    }

    /**
     * Parse a `[a, b, c]` list literal (the right side of `in`), pushing each
     * element's value as a bound parameter. Elements must be literals — a list
     * of field references has no meaning here. Returns the element count so the
     * caller can emit the matching `IN (?, ?, ...)` placeholders. `[]` is legal
     * (count 0), which the caller turns into a constant-false predicate.
     */
    function parseListLiteral(): number {
      expectOp('[');
      if (peek()?.kind === 'op' && peek()?.value === ']') {
        next();
        return 0;
      }
      let count = 0;
      for (;;) {
        const element = parseOperand();
        if (element.isField) {
          throw new FilterError('list elements must be literal values');
        }
        count++;
        const t = next();
        if (t?.kind === 'op' && t.value === ']') break;
        if (!(t?.kind === 'op' && t.value === ',')) {
          throw new FilterError("expected ',' or ']' in list literal");
        }
      }
      return count;
    }

    function parseComparison(): string {
      const t = peek();
      if (t?.kind === 'op' && t.value === '(') {
        next();
        const inner = parseOr();
        expectOp(')');
        return `(${inner})`;
      }
      // CEL presence macro `has(<field>)` — a complete boolean atom, no
      // comparison operator follows. Only the `has(` call form is the macro;
      // a bare `has` elsewhere still resolves as an ordinary field name.
      if (
        t?.kind === 'ident' &&
        t.value === 'has' &&
        peekAt(1)?.kind === 'op' &&
        peekAt(1)?.value === '('
      ) {
        next(); // has
        next(); // (
        const operand = parseOperand();
        expectOp(')');
        if (!operand.isField) {
          throw new FilterError('has() requires a field');
        }
        // A field is present when its column is non-null; a repeated field is
        // present only when non-empty (CEL presence semantics for lists).
        if (operand.propType === 'array') {
          return `(${operand.sql} IS NOT NULL AND json_array_length(${operand.sql}) > 0)`;
        }
        return `${operand.sql} IS NOT NULL`;
      }
      // A function call: `name.contains("x")`, `aliases.exists(a, ...)`. A
      // dotted name that is itself a column (a union path) stays a field.
      if (
        t?.kind === 'ident' &&
        peekAt(1)?.kind === 'op' &&
        peekAt(1)?.value === '(' &&
        !isColumn(t.value)
      ) {
        const call = splitCall(t.value);
        if (call) {
          next(); // the call's identifier
          return parseCall(call.receiver, call.fn);
        }
      }
      const left = parseOperand();
      const opTok = next();
      if (opTok?.kind === 'op' && opTok.value === 'in') {
        // CEL `in` has two `A in list(A)` forms.
        if (peek()?.kind === 'op' && peek()?.value === '[') {
          // `<field> in [<literal>, ...]` → SQL `IN (?, ...)`. The value tested
          // must be a field (a stored column), the list all literals.
          if (!left.isField) {
            throw new FilterError("left side of 'in [...]' must be a field");
          }
          const count = parseListLiteral();
          // `x in []` is always false; SQLite's `IN ()` is a syntax error, so
          // emit a constant-false predicate instead.
          if (count === 0) return '0';
          return `${left.sql} IN (${Array(count).fill('?').join(', ')})`;
        }
        // `<value> in <array field>`: an existence check over the JSON-array
        // column. `left.sql` is the bound `?`, whose parameter was already
        // pushed in operand order above.
        const arr = parseOperand();
        if (!arr.isField || arr.propType !== 'array') {
          throw new FilterError("right side of 'in' must be an array field or a list literal");
        }
        if (left.isField) {
          throw new FilterError("left side of 'in' must be a value");
        }
        return `EXISTS (SELECT 1 FROM json_each(${arr.sql}) WHERE value = ${left.sql})`;
      }
      if (!opTok || opTok.kind !== 'op' || !(opTok.value in COMPARISON_OPS)) {
        throw new FilterError('expected comparison operator');
      }
      const right = parseOperand();
      if (!left.isField && !right.isField) {
        throw new FilterError('comparison must reference a field');
      }
      return `${left.sql} ${COMPARISON_OPS[opTok.value]} ${right.sql}`;
    }

    function parseAnd(): string {
      let sql = parseComparison();
      while (peek()?.kind === 'op' && peek()?.value === '&&') {
        next();
        sql = `${sql} AND ${parseComparison()}`;
      }
      return sql;
    }

    function parseOr(): string {
      let sql = parseAnd();
      while (peek()?.kind === 'op' && peek()?.value === '||') {
        next();
        sql = `(${sql} OR ${parseAnd()})`;
      }
      return sql;
    }

    const sql = parseOr();
    if (pos !== tokens.length) throw new FilterError('unexpected trailing tokens');
    return { sql, params };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid filter: ${msg}`);
  }
}
