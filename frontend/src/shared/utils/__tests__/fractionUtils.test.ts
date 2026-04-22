import { describe, it, expect } from 'vitest';
import { decimalToFraction } from '../fractionUtils';

describe('decimalToFraction', () => {
  it('renders integers without a fraction', () => {
    expect(decimalToFraction(0)).toBe('0');
    expect(decimalToFraction(1)).toBe('1');
    expect(decimalToFraction(8)).toBe('8');
  });

  it('renders values effectively equal to an integer as that integer', () => {
    expect(decimalToFraction(2.0001)).toBe('2');
    expect(decimalToFraction(2.9999)).toBe('3');
  });

  it('renders common fractions', () => {
    expect(decimalToFraction(0.5)).toBe('1/2');
    expect(decimalToFraction(0.25)).toBe('1/4');
    expect(decimalToFraction(0.75)).toBe('3/4');
    expect(decimalToFraction(0.125)).toBe('1/8');
    expect(decimalToFraction(0.375)).toBe('3/8');
  });

  it('renders thirds and sixths', () => {
    expect(decimalToFraction(1 / 3)).toBe('1/3');
    expect(decimalToFraction(2 / 3)).toBe('2/3');
    expect(decimalToFraction(1 / 6)).toBe('1/6');
    expect(decimalToFraction(5 / 6)).toBe('5/6');
  });

  it('renders mixed numbers', () => {
    expect(decimalToFraction(1.5)).toBe('1 1/2');
    expect(decimalToFraction(2.25)).toBe('2 1/4');
    expect(decimalToFraction(3.75)).toBe('3 3/4');
  });

  it('reduces fractions to lowest terms', () => {
    // 0.5 could match 2/4, 3/6, 4/8 — all must reduce to 1/2.
    expect(decimalToFraction(0.5)).toBe('1/2');
    // 0.25 could match 2/8 — must reduce to 1/4.
    expect(decimalToFraction(0.25)).toBe('1/4');
  });

  it('falls back to a trimmed decimal for values with no common fraction', () => {
    expect(decimalToFraction(0.42)).toBe('0.42');
    expect(decimalToFraction(1.42)).toBe('1.42');
  });

  it('returns an empty string for non-finite or negative values', () => {
    expect(decimalToFraction(NaN)).toBe('');
    expect(decimalToFraction(Infinity)).toBe('');
    expect(decimalToFraction(-1)).toBe('');
  });
});
