import { describe, expect, test } from 'vitest';
import {
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MS,
  LoginThrottle,
} from '../../src/engine/login-throttle';

function clock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe('LoginThrottle', () => {
  test('locks an email after the failure limit and reports when it reopens', () => {
    const c = clock();
    const t = new LoginThrottle(c.now);
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) t.recordFailure('a@x.com');
    expect(t.retryAfterSeconds('a@x.com')).toBe(0);
    t.recordFailure('a@x.com');
    expect(t.retryAfterSeconds('a@x.com')).toBe(LOGIN_WINDOW_MS / 1000);

    c.advance(LOGIN_WINDOW_MS / 2);
    expect(t.retryAfterSeconds('a@x.com')).toBe(LOGIN_WINDOW_MS / 2000);
    c.advance(LOGIN_WINDOW_MS / 2 + 1);
    expect(t.retryAfterSeconds('a@x.com')).toBe(0);
  });

  test('emails are matched case- and whitespace-insensitively', () => {
    const t = new LoginThrottle(clock().now);
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) t.recordFailure(i % 2 ? 'A@X.com' : ' a@x.com ');
    expect(t.retryAfterSeconds('a@x.com')).toBeGreaterThan(0);
  });

  test('a success clears the count; other emails are unaffected', () => {
    const t = new LoginThrottle(clock().now);
    for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) t.recordFailure('a@x.com');
    t.recordSuccess('a@x.com');
    t.recordFailure('a@x.com');
    expect(t.retryAfterSeconds('a@x.com')).toBe(0);
    expect(t.retryAfterSeconds('b@x.com')).toBe(0);
  });
});
