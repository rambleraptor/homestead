/**
 * Credentials — the secrets Homestead uses on the household's behalf.
 *
 * Superusers list, add, replace and delete them. A value is write-only: the
 * API returns only a descriptor (set or not, when, and the last few
 * characters), so this page can say a key is in place without anyone — its
 * author included — being able to read it back.
 */

import { useState } from 'react';
import { AlertTriangle, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { getAepErrorMessage } from '@rambleraptor/homestead-core/api/errorMessage';
import { useSecurityStatus } from '../../homestead-information/hooks/useSecurityStatus';
import { useMcpServers } from '../../mcp-servers/hooks/useMcpServers';
import {
  useCreateCredential,
  useCredentialSlots,
  useCredentials,
  useDeleteCredential,
  useSetSlotCredential,
  useUpdateCredential,
} from '../hooks/useCredentials';
import { CredentialForm } from './CredentialForm';
import { CredentialSlots } from './CredentialSlots';
import { SlotValueForm } from './SlotValueForm';
import type { Credential, CredentialFormData, CredentialSlotStatus } from '../types';

type Editing = { kind: 'new' } | { kind: 'edit'; credential: Credential } | null;
type Deleting = { id: string; name: string; slot: boolean } | null;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Set · …3f9a · Oct 26, 2026", or "Not set"; an OAuth sign-in says whether it's connected. */
function valueSummary(credential: Credential): string {
  if (credential.kind === 'oauth') {
    return credential.oauth_connected_at
      ? `OAuth sign-in · connected ${formatDate(credential.oauth_connected_at)}`
      : 'OAuth sign-in · not connected';
  }
  const value = credential.value;
  if (!value?.set) return 'Not set';
  return ['Set', value.hint, value.set_time ? formatDate(value.set_time) : undefined]
    .filter(Boolean)
    .join(' · ');
}

export function CredentialsHome() {
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [settingSlot, setSettingSlot] = useState<CredentialSlotStatus | null>(null);

  const { data: credentials, isLoading, isError, error } = useCredentials();
  const slots = useCredentialSlots();
  const { data: mcpServers } = useMcpServers();
  const setSlot = useSetSlotCredential();
  const security = useSecurityStatus();
  const createCredential = useCreateCredential();
  const updateCredential = useUpdateCredential();
  const deleteCredential = useDeleteCredential();

  // Saving a credential needs a master key; say so before the form, not after.
  const noKey = security.data?.encryptionEnabled === false;

  const handleSubmit = async (data: CredentialFormData) => {
    try {
      if (editing?.kind === 'edit') {
        await updateCredential.mutateAsync({
          id: editing.credential.id,
          data: {
            name: data.name,
            description: data.description || null,
            // Present only when a new value was typed (or cleared).
            ...(data.value !== undefined ? { value: data.value } : {}),
          },
        });
      } else {
        await createCredential.mutateAsync({
          name: data.name,
          value: data.value ?? '',
          ...(data.description ? { description: data.description } : {}),
        });
      }
      setEditing(null);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleSetSlot = async (value: string) => {
    if (!settingSlot) return;
    try {
      await setSlot.mutateAsync({
        slot: settingSlot,
        value,
        exists: (credentials ?? []).some((c) => c.id === settingSlot.id),
      });
      setSettingSlot(null);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  // A slot's value lives in the credential named by its id; the rest are free-form.
  const slotIds = new Set((slots.data ?? []).map((slot) => slot.id));
  const freeForm = (credentials ?? []).filter((c) => !slotIds.has(c.id));
  /** The MCP servers that use a credential, by name. */
  const usedBy = (credential: Credential) =>
    (mcpServers ?? [])
      .filter((server) => server.credential === credential.path || server.credential === credential.id)
      .map((server) => server.name);

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteCredential.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  if (isLoading) {
    return <SkeletonPage body="list" label="Loading credentials" data-testid="credentials-loading" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credentials"
        subtitle="API keys and tokens Homestead uses. Values are write-only: you can set or replace one, but nobody can read it back."
        actions={
          <Button
            onClick={() => setEditing({ kind: 'new' })}
            disabled={noKey}
            data-testid="add-credential-button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add credential
          </Button>
        }
      />

      {noKey && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          data-testid="credentials-no-key"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            This Homestead has no master key, so credentials can’t be saved. Run{' '}
            <code>homestead key generate</code> on the server and restart it.
          </p>
        </div>
      )}

      <CredentialSlots
        slots={slots.data}
        isLoading={slots.isLoading}
        error={slots.error}
        disabled={noKey}
        onSet={setSettingSlot}
        onClear={(slot) => setDeleting({ id: slot.id, name: slot.label, slot: true })}
      />

      {(slots.data?.length ?? 0) > 0 && (
        <h2 className="text-lg font-semibold text-gray-900">Other credentials</h2>
      )}

      {isError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn’t load credentials: {getAepErrorMessage(error)}
        </div>
      ) : !freeForm.length ? (
        <Card>
          <div className="py-10 text-center" data-testid="credentials-empty">
            <KeyRound className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-gray-600">No credentials yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Add the tokens other services need, such as an MCP server’s.
            </p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="credentials-list">
          {freeForm.map((credential) => (
            <li key={credential.id}>
              <Card>
                <div className="flex items-start justify-between gap-4" data-testid={`credential-${credential.id}`}>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900">{credential.name}</h3>
                    {credential.description && (
                      <p className="mt-1 text-sm text-gray-600">{credential.description}</p>
                    )}
                    <p
                      className="mt-2 font-mono text-xs text-gray-500"
                      data-testid={`credential-value-${credential.id}`}
                    >
                      {valueSummary(credential)}
                    </p>
                    {usedBy(credential).length > 0 && (
                      <p className="mt-1 text-xs text-gray-500" data-testid={`credential-used-by-${credential.id}`}>
                        Used by {usedBy(credential).map((name) => `${name} (MCP server)`).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    {/* An OAuth sign-in is managed from its MCP server's card. */}
                    {credential.kind !== 'oauth' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditing({ kind: 'edit', credential })}
                        aria-label={`Edit ${credential.name}`}
                        data-testid={`edit-credential-${credential.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDeleting({ id: credential.id, name: credential.name, slot: false })}
                      aria-label={`Delete ${credential.name}`}
                      data-testid={`delete-credential-${credential.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.kind === 'edit' ? `Edit ${editing.credential.name}` : 'Add credential'}
      >
        {editing && (
          <CredentialForm
            initialData={editing.kind === 'edit' ? editing.credential : undefined}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
            isSubmitting={createCredential.isPending || updateCredential.isPending}
          />
        )}
      </Modal>

      <Modal
        isOpen={settingSlot !== null}
        onClose={() => setSettingSlot(null)}
        title={settingSlot?.stored ? `Replace ${settingSlot.label}` : `Set ${settingSlot?.label ?? ''}`}
      >
        {settingSlot && (
          <SlotValueForm
            slot={settingSlot}
            onSubmit={handleSetSlot}
            onCancel={() => setSettingSlot(null)}
            isSubmitting={setSlot.isPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={deleting?.slot ? 'Clear credential' : 'Delete credential'}
        message={
          deleting?.slot
            ? `Clear the stored ${deleting.name}? What uses it stops working until it's set again.`
            : `Delete “${deleting?.name ?? ''}”? Anything that uses it will stop working. This can’t be undone.`
        }
        confirmLabel={deleting?.slot ? 'Clear' : 'Delete'}
        variant="danger"
        isLoading={deleteCredential.isPending}
      />
    </div>
  );
}
