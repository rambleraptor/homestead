import { useMemo, useState } from 'react';
import { Copy, KeyRound, Trash2 } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { getAepErrorMessage } from '@rambleraptor/homestead-core/api/errorMessage';
import {
  GrantRowsEditor,
  cleanGrantDrafts,
  newGrantDraft,
  validateGrantDrafts,
  type GrantDraft,
} from '@rambleraptor/homestead-core/permissions/components/GrantRowsEditor';
import {
  usePersonalAccessTokens,
  type AepPersonalAccessToken,
  type TokenScope,
} from '../hooks/usePersonalAccessTokens';
import { useMintPersonalAccessToken } from '../hooks/useMintPersonalAccessToken';
import { useRevokePersonalAccessToken } from '../hooks/useRevokePersonalAccessToken';

function describeScope(scope: TokenScope): string {
  const target =
    scope.target_scope === 'all'
      ? 'Everything'
      : scope.target_scope === 'app'
        ? `App: ${scope.target_app}`
        : `Collection: ${scope.resource_type}${scope.filter ? ` where ${scope.filter}` : ''}`;
  const prefix = scope.effect === 'deny' ? 'deny ' : '';
  return `${prefix}${scope.capability} · ${target}`;
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

export function PersonalAccessTokens() {
  const toast = useToast();
  const { data: tokens = [], isLoading, isError, error: loadError } = usePersonalAccessTokens();
  const mint = useMintPersonalAccessToken();
  const revoke = useRevokePersonalAccessToken();

  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [grants, setGrants] = useState<GrantDraft[]>([]);
  const [mintedSecret, setMintedSecret] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AepPersonalAccessToken | null>(null);

  const patchGrant = (key: number, over: Partial<GrantDraft>) =>
    setGrants((gs) => gs.map((g) => (g.key === key ? { ...g, ...over } : g)));
  const removeGrant = (key: number) => setGrants((gs) => gs.filter((g) => g.key !== key));

  const scopes = useMemo<TokenScope[]>(() => cleanGrantDrafts(grants) as TokenScope[], [grants]);

  const resetForm = () => {
    setName('');
    setExpiresAt('');
    setGrants([]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Give the token a name.');
      return;
    }
    const grantError = validateGrantDrafts(grants);
    if (grantError) {
      toast.error(grantError);
      return;
    }
    try {
      const result = await mint.mutateAsync({
        name: name.trim(),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        scopes,
      });
      setMintedSecret(result.token);
      resetForm();
    } catch (error) {
      // The mint hook opts out of the global mutation toast; show it here.
      toast.error(error);
    }
  };

  const handleRevoke = async (token: AepPersonalAccessToken) => {
    try {
      await revoke.mutateAsync(token.id);
      toast.success('Token revoked.');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    } finally {
      setConfirmTarget(null);
    }
  };

  const copySecret = async () => {
    if (!mintedSecret) return;
    try {
      await navigator.clipboard.writeText(mintedSecret);
      toast.success('Token copied to clipboard.');
    } catch {
      toast.error('Could not copy — select and copy it manually.');
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
      <div className="space-y-6" data-testid="personal-access-tokens">
        <div className="flex items-start gap-4">
          <KeyRound className="w-6 h-6 text-gray-600 mt-1" />
          <div>
            <h3 className="font-semibold text-gray-900">Personal Access Tokens</h3>
            <p className="text-sm text-gray-600">
              Issue a token to call the API. Scope it with grants using the same
              controls as roles — a token is always limited to what you can do, so a
              scope beyond your own access simply has no effect.
            </p>
          </div>
        </div>

        {/* Existing tokens */}
        {isError ? (
          <p className="text-sm text-red-600" role="alert" data-testid="tokens-error">
            Couldn&apos;t load your tokens: {getAepErrorMessage(loadError)}
          </p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-gray-500" data-testid="no-tokens">
            You haven&apos;t issued any tokens yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {tokens.map((token) => {
              const expires = formatDate(token.expires_at);
              const lastUsed = formatDate(token.last_used_at);
              return (
                <li
                  key={token.id}
                  className="flex items-center justify-between gap-4 py-3"
                  data-testid="token-row"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{token.name}</span>
                      {token.token_prefix && (
                        <code className="text-xs text-gray-500">{token.token_prefix}…</code>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {token.scopes && token.scopes.length > 0
                        ? token.scopes.map(describeScope).join(', ')
                        : 'No access (inert)'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {expires ? `Expires ${expires}` : 'Never expires'}
                      {lastUsed ? ` · Last used ${lastUsed}` : ' · Never used'}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmTarget(token)}
                    data-testid="revoke-token"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Revoke
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Create form */}
        <form onSubmit={handleCreate} className="space-y-4 border-t border-gray-100 pt-4">
          <h4 className="font-medium text-gray-900">New token</h4>
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Home Assistant"
            data-testid="token-name"
          />
          <Input
            label="Expiration (optional)"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            data-testid="token-expiry"
          />

          <GrantRowsEditor
            grants={grants}
            onPatch={patchGrant}
            onRemove={removeGrant}
            onAdd={() => setGrants((gs) => [...gs, newGrantDraft()])}
            heading="Scopes"
            addLabel="Add scope"
            addTestId="token-add-scope"
            rowsTestId="token-scopes"
            emptyHint="No scopes — this token will be inert until you add one."
            datalistId="token-resource-options"
          />

          <Button type="submit" disabled={mint.isPending} data-testid="create-token">
            {mint.isPending ? 'Creating…' : 'Create token'}
          </Button>
        </form>
      </div>

      {/* One-time secret reveal */}
      <Modal
        isOpen={mintedSecret !== null}
        onClose={() => setMintedSecret(null)}
        title="Copy your new token"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This is the only time the token will be shown. Copy it now and store it
            somewhere safe — you won&apos;t be able to see it again.
          </p>
          <div className="flex items-center gap-2">
            <code
              className="flex-1 text-sm bg-gray-50 border border-gray-200 rounded px-3 py-2 break-all"
              data-testid="minted-secret"
            >
              {mintedSecret}
            </code>
            <Button variant="secondary" size="sm" onClick={copySecret}>
              <Copy className="w-4 h-4 mr-1" />
              Copy
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setMintedSecret(null)}>Done</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => confirmTarget && handleRevoke(confirmTarget)}
        title="Revoke token"
        message={`Revoke "${confirmTarget?.name ?? 'this token'}"? Any client using it will immediately lose access.`}
        confirmLabel="Revoke"
        variant="danger"
        isLoading={revoke.isPending}
      />
    </Card>
  );
}
