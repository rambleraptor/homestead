import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NativeDeviceSettings } from '../NativeDeviceSettings';
const mocks = vi.hoisted(() => ({ request: vi.fn(), revoke: vi.fn(), viewAs: null as null | { id: string } }));
vi.mock('../bridge', async (original) => ({ ...await original<typeof import('../bridge')>(), isNativeHomestead: () => true, nativeRequest: mocks.request, revokeNativeToken: mocks.revoke }));
vi.mock('../../api/aepbase', () => ({ aepbase: { authStore: { token: 'SESSION', needsRenewal: false }, getCurrentUser: () => ({ id: 'owner' }) }, refreshSession: vi.fn() }));
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ realUser: { id: 'owner' }, viewAs: mocks.viewAs }) }));
vi.mock('../../apps/registry', () => ({ getAllApps: () => [{ id: 'groceries', name: 'Groceries' }, { id: 'todos', name: 'Todos' }] }));
beforeEach(() => {
  mocks.viewAs = null; mocks.request.mockReset(); mocks.revoke.mockReset().mockResolvedValue(undefined);
  mocks.request.mockImplementation(async (type) => type === 'beginPairing' ? { nonce: 'NONCE' } : { version: 1, paired: false, server: 'https://home.example', features: [] });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'DEVICE', id: 'new-device' }))));
});
afterEach(() => { vi.unstubAllGlobals(); });
describe('web-owned iPhone settings', () => {
  it('requires explicit resource selection and sends least-privilege scopes', async () => {
    render(<NativeDeviceSettings />);
    const enable = await screen.findByRole('button', { name: 'Enable widgets and Siri' });
    expect(enable).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Groceries')); fireEvent.click(enable);
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('pairingCompleted', { nonce: 'NONCE', token: 'DEVICE', tokenID: 'new-device' }));
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.scopes).toHaveLength(3);
    expect(body.scopes.some((s: { capability: string }) => s.capability === 'manage')).toBe(false);
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now());
  });
  it('revokes the new token when native validation rejects pairing', async () => {
    mocks.request.mockImplementation(async (type) => {
      if (type === 'pairingCompleted') throw new Error('Wrong account');
      return type === 'beginPairing' ? { nonce: 'NONCE' } : { version: 1, paired: false, features: [] };
    });
    render(<NativeDeviceSettings />);
    fireEvent.click(await screen.findByLabelText('Groceries'));
    fireEvent.click(screen.getByRole('button', { name: 'Enable widgets and Siri' }));
    await screen.findByText('Wrong account');
    expect(mocks.revoke).toHaveBeenCalledWith('new-device', 'SESSION');
  });
  it('disables device controls during a view-as preview', async () => {
    mocks.viewAs = { id: 'someone-else' };
    render(<NativeDeviceSettings />);
    expect(await screen.findByLabelText('Groceries')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enable widgets and Siri' })).toBeDisabled();
  });
});
