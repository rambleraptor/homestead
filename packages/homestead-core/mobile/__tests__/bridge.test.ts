import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNativeHomestead, nativeRequest, nativeScopes, revokeNativeDeviceOnLogout } from '../bridge';

afterEach(() => { vi.unstubAllGlobals(); delete (window as Window & { webkit?: unknown }).webkit; });
function installHandler() {
  const postMessage = vi.fn(async () => ({ version: 1, tokenID: 'device-id' }));
  Object.defineProperty(window, 'webkit', { value: { messageHandlers: { homestead: { postMessage } } }, configurable: true });
  return postMessage;
}
describe('native platform bridge', () => {
  it('is absent in a normal browser and never calls an arbitrary fallback', async () => {
    expect(isNativeHomestead()).toBe(false);
    await expect(nativeRequest('ready')).rejects.toThrow('iOS app');
  });
  it('pins protocol version and message type', async () => {
    const handler = installHandler();
    await nativeRequest('ready', { type: 'disconnect', version: 99 });
    expect(handler).toHaveBeenCalledWith({ type: 'ready', version: 1 });
  });
  it('grants only chosen collections with no manage or all scope', () => {
    const scopes = nativeScopes(['groceries']);
    expect(scopes).toEqual([
      { capability: 'read', target_scope: 'collection', resource_type: 'grocery' },
      { capability: 'read', target_scope: 'collection', resource_type: 'store' },
      { capability: 'write', target_scope: 'collection', resource_type: 'grocery' },
    ]);
    expect(nativeScopes(['todos']).map((s) => s.resource_type)).toContain('personal-todo');
    expect(() => nativeScopes([])).toThrow();
  });
  it('clears local native access even when remote revocation fails', async () => {
    const handler = installHandler();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(revokeNativeDeviceOnLogout('SESSION')).rejects.toThrow('offline');
    expect(handler).toHaveBeenLastCalledWith({ type: 'disable', version: 1 });
  });
  it('revokes the device token using the interactive session', async () => {
    installHandler();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await revokeNativeDeviceOnLogout('SESSION');
    expect(fetchMock).toHaveBeenCalledWith('/api/tokens/device-id', { method: 'DELETE', headers: { Authorization: 'Bearer SESSION' } });
  });
});
