import { useEffect, useState } from 'react';
import { aepbase, refreshSession } from '../api/aepbase';
import { useAuth } from '../auth/useAuth';
import { getAllApps } from '../apps/registry';
import { isNativeHomestead, nativeRequest, nativeScopes, revokeNativeToken, type NativeFeature, type NativeStatus } from './bridge';

export function NativeDeviceSettings() {
  const { realUser, viewAs } = useAuth();
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const [features, setFeatures] = useState<NativeFeature[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  useEffect(() => {
    if (!isNativeHomestead()) return;
    let active = true;
    void nativeRequest('ready').then((value) => {
      if (active && value.version === 1) {
        setStatus(value);
        setFeatures((value.features ?? []).filter((v): v is NativeFeature => v === 'groceries' || v === 'todos'));
      }
    }).catch(() => { /* A regular browser or older bridge has no device settings. */ });
    return () => { active = false; };
  }, []);
  if (!status) return null;
  const available = getAllApps().filter((app) => app.id === 'groceries' || app.id === 'todos');
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const sessionToken = async () => {
    if (aepbase.authStore.needsRenewal) await refreshSession();
    if (!aepbase.authStore.token || !realUser || realUser.id !== aepbase.getCurrentUser()?.id) throw new Error('Sign in again before enabling native access.');
    return aepbase.authStore.token;
  };
  const pair = () => run(async () => {
    if (!realUser || viewAs) throw new Error('Exit user preview before changing this device’s access.');
    const scopes = nativeScopes(features);
    const token = await sessionToken();
    const { nonce } = await nativeRequest<{ nonce: string }>('beginPairing', { features, userID: realUser.id });
    const response = await fetch('/api/tokens', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Homestead iPhone', expires_at: new Date(Date.now() + 90 * 86400000).toISOString(), scopes }),
    });
    if (!response.ok) throw new Error('Could not enable this device. Check your account permissions and try again.');
    const minted = await response.json() as { token: string; id: string };
    try {
      const next = await nativeRequest('pairingCompleted', { nonce, token: minted.token, tokenID: minted.id });
      setStatus(next);
    } catch (error) {
      await revokeNativeToken(minted.id, token);
      throw error;
    }
    if (status.tokenID && status.tokenID !== minted.id) await revokeNativeToken(status.tokenID, token);
    setMessage('Widgets and Siri are enabled for 90 days. Add a widget from the iOS Home Screen widget gallery, or find Homestead in Shortcuts.');
  });
  const disable = (disconnect = false) => run(async () => {
    let warning = '';
    try {
      if (status.tokenID) await revokeNativeToken(status.tokenID, await sessionToken());
    } catch (error) { warning = error instanceof Error ? error.message : String(error); }
    // Always remove local credentials even if the server cannot be reached.
    const next = await nativeRequest(disconnect ? 'disconnect' : 'disable');
    setStatus(next);
    setMessage(warning || 'Native access has been disabled on this device.');
  });
  return (
    <section className="rounded-2xl border border-gray-200 bg-surface-white p-6 space-y-4" data-testid="native-device-settings">
      <div><h2 className="text-xl font-semibold text-brand-navy">This iPhone</h2>
        <p className="text-sm text-text-muted">Use Homestead from widgets and Siri, even while this app is closed.</p></div>
      <p className="text-sm break-all">{status.server} · {status.paired ? 'Native access enabled' : 'Native access disabled'}</p>
      <fieldset disabled={busy || !!viewAs} className="space-y-3">
        <legend className="font-medium mb-2">Allow reading, creating, and completing items in:</legend>
        {available.map((app) => (
          <label key={app.id} className="flex items-center gap-3 min-h-11">
            <input type="checkbox" checked={features.includes(app.id as NativeFeature)} onChange={(event) => {
              setFeatures(event.target.checked ? [...features, app.id as NativeFeature] : features.filter((v) => v !== app.id));
            }} />{app.name}
          </label>
        ))}
        {available.length === 0 && <p>No supported apps are installed on this server.</p>}
        <button type="button" disabled={!features.length} onClick={pair} className="px-4 py-3 rounded-lg bg-brand-navy text-white disabled:opacity-50">
          {busy ? 'Updating…' : status.paired ? 'Update native access' : 'Enable widgets and Siri'}
        </button>
        <label className="flex items-center gap-3 min-h-11">
          <input type="checkbox" checked={status.showDetails ?? false} onChange={(event) => {
            const showDetails = event.target.checked;
            void run(async () => { setStatus(await nativeRequest('setWidgetPrivacy', { showDetails })); });
          }} />Show item titles in widgets
        </label>
        <p className="text-sm text-text-muted">Counts are shown by default. Item titles may be visible without opening Homestead.</p>
        {status.tokenID && <button type="button" onClick={() => disable()} className="block min-h-11 text-brand-navy underline">Disable native access</button>}
        <button type="button" onClick={() => setConfirmDisconnect(true)} className="block min-h-11 text-brand-navy underline">Disconnect this server</button>
      </fieldset>
      {viewAs && <p>Exit user preview to change device access.</p>}
      {confirmDisconnect && <div className="border-t border-gray-200 pt-4 space-y-3">
        <p>Disconnect and remove this server’s local sign-in, widget data, and native access? If remote revocation fails, revoke the iPhone token in server Settings → Connections.</p>
        <button type="button" disabled={busy} onClick={() => disable(true)} className="px-4 py-3 rounded-lg bg-brand-navy text-white">Disconnect</button>{' '}
        <button type="button" disabled={busy} onClick={() => setConfirmDisconnect(false)} className="px-4 py-3">Cancel</button>
      </div>}
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </section>
  );
}
