import { describe, expect, it } from 'vitest';
import { jsonEqual, canonicalStringify } from '../equal';

describe('jsonEqual', () => {
  it('treats key-order differences as equal', () => {
    expect(jsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('respects array order', () => {
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
  });

  it('handles deeply nested objects', () => {
    const a = { x: { y: [{ z: 1, q: 2 }] } };
    const b = { x: { y: [{ q: 2, z: 1 }] } };
    expect(jsonEqual(a, b)).toBe(true);
  });

  it('distinguishes nulls and missing keys', () => {
    expect(jsonEqual({ a: null }, {})).toBe(false);
  });
});

describe('canonicalStringify', () => {
  it('sorts object keys alphabetically', () => {
    expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});
