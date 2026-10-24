import { describe, expect, test } from 'vitest';
import { compileFilter } from '../../src/engine/filter';
import type { Schema } from '../../src/engine/types';

const schema: Schema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    pages: { type: 'integer' },
    in_print: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    ratings: { type: 'array', items: { type: 'integer' } },
    id: { type: 'string', readOnly: true },
  },
};

describe('compileFilter', () => {
  test('equality on a string field', () => {
    const f = compileFilter('title == "Dune"', schema);
    expect(f.sql).toBe('title = ?');
    expect(f.params).toEqual(['Dune']);
  });

  test('single-quoted strings', () => {
    const f = compileFilter("title == 'Dune'", schema);
    expect(f.params).toEqual(['Dune']);
  });

  test('numeric comparisons', () => {
    for (const [op, sql] of [
      ['!=', '!='],
      ['<', '<'],
      ['<=', '<='],
      ['>', '>'],
      ['>=', '>='],
    ] as const) {
      const f = compileFilter(`pages ${op} 100`, schema);
      expect(f.sql).toBe(`pages ${sql} ?`);
      expect(f.params).toEqual([100]);
    }
  });

  test('negative and decimal numbers', () => {
    expect(compileFilter('pages > -1', schema).params).toEqual([-1]);
    expect(compileFilter('pages > 1.5', schema).params).toEqual([1.5]);
  });

  test('booleans bind as 0/1', () => {
    const f = compileFilter('in_print == true', schema);
    expect(f.params).toEqual([1]);
    expect(compileFilter('in_print == false', schema).params).toEqual([0]);
  });

  test('&& and || with precedence and parens', () => {
    const f = compileFilter('title == "a" && pages > 1 || in_print == true', schema);
    expect(f.sql).toBe('(title = ? AND pages > ? OR in_print = ?)');
    expect(f.params).toEqual(['a', 1, 1]);

    const g = compileFilter('title == "a" && (pages > 1 || in_print == true)', schema);
    expect(g.sql).toBe('title = ? AND ((pages > ? OR in_print = ?))');
  });

  test('literal can appear on the left', () => {
    const f = compileFilter('100 < pages', schema);
    expect(f.sql).toBe('? < pages');
  });

  test('rejects unknown fields (no injection through identifiers)', () => {
    expect(() => compileFilter('password == "x"', schema)).toThrow(/invalid filter/);
    // `path` stays non-filterable...
    expect(() => compileFilter('path == "x"', schema)).toThrow(/invalid filter/);
  });

  test('the engine-managed timestamps are filterable', () => {
    const f = compileFilter('update_time > "2026-10-17T00:00:00Z"', schema);
    expect(f.sql).toBe('update_time > ?');
    expect(f.params).toEqual(['2026-10-17T00:00:00Z']);
    const g = compileFilter(
      'create_time >= "2026-01-01T00:00:00Z" && create_time < "2026-02-01T00:00:00Z" && in_print == true',
      schema,
    );
    expect(g.sql).toBe('create_time >= ? AND create_time < ? AND in_print = ?');
    expect(() => compileFilter('has(update_time)', schema)).not.toThrow();
  });

  test('id is filterable (it is the primary-key column)', () => {
    const f = compileFilter('id == "abc"', schema);
    expect(f.sql).toBe('id = ?');
    expect(f.params).toEqual(['abc']);
  });

  test('rejects malformed expressions', () => {
    for (const bad of [
      'title ==',
      '== "x"',
      'title = "x"', // single = is not an operator
      'title == "x" &&',
      '(title == "x"',
      'title == "x" extra',
      '1 == 2', // no field reference
      'title; DROP TABLE books',
    ]) {
      expect(() => compileFilter(bad, schema)).toThrow(/invalid filter/);
    }
  });

  test('membership on a scalar array (CEL `in`)', () => {
    const f = compileFilter('"vip" in tags', schema);
    expect(f.sql).toBe('EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)');
    expect(f.params).toEqual(['vip']);
  });

  test('membership on a numeric array', () => {
    const f = compileFilter('5 in ratings', schema);
    expect(f.sql).toBe('EXISTS (SELECT 1 FROM json_each(ratings) WHERE value = ?)');
    expect(f.params).toEqual([5]);
  });

  test('membership composes with && and keeps parameter order', () => {
    const f = compileFilter('"vip" in tags && pages > 100', schema);
    expect(f.sql).toBe(
      'EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?) AND pages > ?',
    );
    expect(f.params).toEqual(['vip', 100]);
  });

  test('rejects `in` against a non-array field', () => {
    expect(() => compileFilter('"x" in title', schema)).toThrow(/invalid filter/);
  });

  test('rejects `in` with a field on the left (array-field form)', () => {
    expect(() => compileFilter('title in tags', schema)).toThrow(/invalid filter/);
  });

  test('membership in a string list literal (CEL `field in [...]`)', () => {
    const f = compileFilter('id in ["a", "b", "c"]', schema);
    expect(f.sql).toBe('id IN (?, ?, ?)');
    expect(f.params).toEqual(['a', 'b', 'c']);
  });

  test('membership in a numeric list literal', () => {
    const f = compileFilter('pages in [100, 200]', schema);
    expect(f.sql).toBe('pages IN (?, ?)');
    expect(f.params).toEqual([100, 200]);
  });

  test('single-element list literal', () => {
    const f = compileFilter('id in ["only"]', schema);
    expect(f.sql).toBe('id IN (?)');
    expect(f.params).toEqual(['only']);
  });

  test('empty list literal is a constant-false predicate', () => {
    const f = compileFilter('id in []', schema);
    expect(f.sql).toBe('0');
    expect(f.params).toEqual([]);
  });

  test('list-literal membership composes with && and keeps parameter order', () => {
    const f = compileFilter('id in ["a", "b"] && pages > 10', schema);
    expect(f.sql).toBe('id IN (?, ?) AND pages > ?');
    expect(f.params).toEqual(['a', 'b', 10]);
  });

  test('list elements must be literals, not fields', () => {
    expect(() => compileFilter('id in [title]', schema)).toThrow(/invalid filter/);
  });

  test('rejects a list literal on the left of `in`', () => {
    expect(() => compileFilter('["a"] in tags', schema)).toThrow(/invalid filter/);
  });

  test('rejects a malformed list literal', () => {
    for (const bad of ['id in ["a"', 'id in "a", "b"]', 'id in ["a" "b"]']) {
      expect(() => compileFilter(bad, schema)).toThrow(/invalid filter/);
    }
  });

  test('has() presence on a scalar field', () => {
    const f = compileFilter('has(title)', schema);
    expect(f.sql).toBe('title IS NOT NULL');
    expect(f.params).toEqual([]);
  });

  test('has() presence on an array field requires non-empty', () => {
    const f = compileFilter('has(tags)', schema);
    expect(f.sql).toBe('(tags IS NOT NULL AND json_array_length(tags) > 0)');
    expect(f.params).toEqual([]);
  });

  test('has() composes with other predicates', () => {
    const f = compileFilter('has(tags) && pages > 100', schema);
    expect(f.sql).toBe(
      '(tags IS NOT NULL AND json_array_length(tags) > 0) AND pages > ?',
    );
    expect(f.params).toEqual([100]);
  });

  test('rejects has() on a non-field and unknown field', () => {
    expect(() => compileFilter('has("x")', schema)).toThrow(/invalid filter/);
    expect(() => compileFilter('has(nope)', schema)).toThrow(/invalid filter/);
  });

  test('values only travel as parameters', () => {
    const f = compileFilter(`title == "'; DROP TABLE books; --"`, schema);
    expect(f.sql).toBe('title = ?');
    expect(f.params[0]).toBe("'; DROP TABLE books; --");
  });
});
