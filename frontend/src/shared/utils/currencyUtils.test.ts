/**
 * Tests for currency formatting utilities
 */

import { describe, it, expect } from 'vitest';
import { formatCurrency } from './currencyUtils';

describe('formatCurrency', () => {
  it('should format whole numbers with two decimal places', () => {
    expect(formatCurrency(100)).toBe('$100.00');
    expect(formatCurrency(50)).toBe('$50.00');
    expect(formatCurrency(1)).toBe('$1.00');
  });

  it('should format decimal numbers with two decimal places', () => {
    expect(formatCurrency(100.5)).toBe('$100.50');
    expect(formatCurrency(50.25)).toBe('$50.25');
    expect(formatCurrency(1.99)).toBe('$1.99');
  });

  it('should add comma separators for thousands', () => {
    expect(formatCurrency(1000)).toBe('$1,000.00');
    expect(formatCurrency(10000)).toBe('$10,000.00');
    expect(formatCurrency(100000)).toBe('$100,000.00');
    expect(formatCurrency(1000000)).toBe('$1,000,000.00');
  });

  it('should add comma separators for thousands with decimals', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCurrency(12345.67)).toBe('$12,345.67');
    expect(formatCurrency(123456.78)).toBe('$123,456.78');
    expect(formatCurrency(1234567.89)).toBe('$1,234,567.89');
  });

  it('should round to two decimal places', () => {
    expect(formatCurrency(100.126)).toBe('$100.13');
    expect(formatCurrency(100.124)).toBe('$100.12');
    expect(formatCurrency(100.999)).toBe('$101.00');
    expect(formatCurrency(99.995)).toBe('$100.00');
  });

  it('should handle zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('should handle negative numbers', () => {
    expect(formatCurrency(-100)).toBe('-$100.00');
    expect(formatCurrency(-1234.56)).toBe('-$1,234.56');
    expect(formatCurrency(-0.01)).toBe('-$0.01');
  });

  it('should handle very small decimal amounts', () => {
    expect(formatCurrency(0.01)).toBe('$0.01');
    expect(formatCurrency(0.99)).toBe('$0.99');
    expect(formatCurrency(0.5)).toBe('$0.50');
  });

  it('should handle large numbers with proper formatting', () => {
    expect(formatCurrency(999999.99)).toBe('$999,999.99');
    expect(formatCurrency(9999999.99)).toBe('$9,999,999.99');
  });

  it('should handle numbers with many decimal places (rounding)', () => {
    expect(formatCurrency(12.3456789)).toBe('$12.35');
    expect(formatCurrency(12.3446789)).toBe('$12.34');
  });

  it('should handle typical gift card amounts', () => {
    // Common gift card denominations
    expect(formatCurrency(25)).toBe('$25.00');
    expect(formatCurrency(50)).toBe('$50.00');
    expect(formatCurrency(100)).toBe('$100.00');
    expect(formatCurrency(500)).toBe('$500.00');
  });

  it('should handle fractional gift card amounts', () => {
    // Partially used gift cards
    expect(formatCurrency(47.83)).toBe('$47.83');
    expect(formatCurrency(12.50)).toBe('$12.50');
    expect(formatCurrency(99.99)).toBe('$99.99');
  });
});
