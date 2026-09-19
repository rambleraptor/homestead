import { beforeEach, describe, expect, it } from 'vitest';
import {
  isSafeReturnPath,
  rememberOAuthReturnUrl,
  takeOAuthReturnUrl,
} from '../oauthReturn';

describe('oauthReturn', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('round-trips a same-origin path and clears it on take', () => {
    rememberOAuthReturnUrl('/todos');
    expect(takeOAuthReturnUrl()).toBe('/todos');
    expect(takeOAuthReturnUrl()).toBeNull();
  });

  it('returns null when nothing was parked', () => {
    expect(takeOAuthReturnUrl()).toBeNull();
  });

  it('refuses off-origin destinations', () => {
    rememberOAuthReturnUrl('https://evil.example/phish');
    expect(takeOAuthReturnUrl()).toBeNull();
    rememberOAuthReturnUrl('//evil.example/phish');
    expect(takeOAuthReturnUrl()).toBeNull();
  });

  it('exposes the same rule for callers', () => {
    expect(isSafeReturnPath('/games/minigolf?x=1')).toBe(true);
    expect(isSafeReturnPath('todos')).toBe(false);
    expect(isSafeReturnPath(null)).toBe(false);
  });
});
