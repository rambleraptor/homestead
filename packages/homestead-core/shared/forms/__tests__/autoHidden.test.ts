import { describe, expect, test } from 'vitest';
import { isAutoHidden } from '../helpers';

describe('isAutoHidden', () => {
  test('hides system, deprecated and user-pointer fields; shows ordinary ones', () => {
    expect(isAutoHidden({ type: 'object', system: true })).toBe(true);
    expect(isAutoHidden({ type: 'string', deprecated: true })).toBe(true);
    expect(isAutoHidden({ type: 'string', reference: { resource: 'user' } })).toBe(true);
    expect(isAutoHidden({ type: 'string' })).toBe(false);
  });
});
