import { useState } from 'react';
import { Plug, Trash2 } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { getAepErrorMessage } from '@rambleraptor/homestead-core/api/errorMessage';
import { useConnectedApps, type ConnectedApp } from '../hooks/useConnectedApps';
import { useRevokeConnectedApp } from '../hooks/useRevokeConnectedApp';

/** Human-readable access level from an OAuth scope string. */
function describeAccess(scope: string | null): string {
  const scopes = new Set((scope ?? '').split(/\s+/).filter(Boolean));
  // A write scope (or the legacy broad `homestead`, or no scope at all) grants
  // full access; only a purely read scope is read-only. Mirrors the server's
  // scopeAllowsWrite.
  if (scopes.has('homestead:write') || scopes.has('homestead')) return 'Read & write';
  if (scopes.size === 0) return 'Read & write';
  if (scopes.has('homestead:read')) return 'Read only';
  return scope ?? 'Read & write';
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

export function ConnectedApps() {
  const toast = useToast();
  const { data: apps = [], isLoading, isError, error: loadError } = useConnectedApps();
  const revoke = useRevokeConnectedApp();
  const [confirmTarget, setConfirmTarget] = useState<ConnectedApp | null>(null);

  const handleDisconnect = async (app: ConnectedApp) => {
    try {
      await revoke.mutateAsync(app.client_id);
      toast.success('App disconnected.');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    } finally {
      setConfirmTarget(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Card>
      <div className="space-y-6" data-testid="connected-apps">
        <div className="flex items-start gap-4">
          <Plug className="w-6 h-6 text-gray-600 mt-1" />
          <div>
            <h3 className="font-semibold text-gray-900">Connected apps</h3>
            <p className="text-sm text-gray-600">
              Apps you&apos;ve authorized to access your data over OAuth, including
              MCP clients. Disconnecting an app immediately revokes every token it
              holds — it will have to be authorized again to reconnect.
            </p>
          </div>
        </div>

        {isError ? (
          <p className="text-sm text-red-600" role="alert" data-testid="connected-apps-error">
            Couldn&apos;t load connected apps: {getAepErrorMessage(loadError)}
          </p>
        ) : apps.length === 0 ? (
          <p className="text-sm text-gray-500" data-testid="no-connected-apps">
            You haven&apos;t connected any apps yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {apps.map((app) => {
              const connected = formatDate(app.connected_at);
              const expires = formatDate(app.expires_at);
              return (
                <li
                  key={app.client_id}
                  className="flex items-center justify-between gap-4 py-3"
                  data-testid="connected-app-row"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">
                        {app.client_name || 'Unnamed app'}
                      </span>
                      <span className="text-xs text-gray-500">{describeAccess(app.scope)}</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {connected ? `Connected ${connected}` : 'Recently connected'}
                      {app.session_count > 1 ? ` · ${app.session_count} sessions` : ''}
                      {expires ? ` · Expires ${expires}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmTarget(app)}
                    data-testid="disconnect-app"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Disconnect
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => confirmTarget && handleDisconnect(confirmTarget)}
        title="Disconnect app"
        message={`Disconnect "${confirmTarget?.client_name || 'this app'}"? It will immediately lose access and must be authorized again to reconnect.`}
        confirmLabel="Disconnect"
        variant="danger"
        isLoading={revoke.isPending}
      />
    </Card>
  );
}
