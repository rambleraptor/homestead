import { describe, expect, it } from 'vitest';
import { isAllowedRedirectUri, redirectUriProblem } from '../redirectUri';

describe('redirect URI policy', () => {
  it.each([
    'https://client.example/cb',
    'https://client.example/cb?error=access_denied&state=x',
    'http://localhost:3000/cb',
    'http://127.0.0.1/cb',
    'http://[::1]:9000/cb',
    'com.example.app:/oauth/cb',
    'cursor://anysphere.cursor-mcp/oauth/callback',
  ])('allows %s', (uri) => {
    expect(redirectUriProblem(uri)).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'javascript:alert(1)?error=access_denied',
    'data:text/html,hi',
    'vbscript:x',
    'blob:https://x/1',
    'file:///etc/passwd',
    'http://client.example/cb',
    'http://192.168.1.10/cb',
    'https://client.example/cb#x',
    '',
    'relative/path',
  ])('rejects %s', (uri) => {
    expect(isAllowedRedirectUri(uri)).toBe(false);
  });
});
