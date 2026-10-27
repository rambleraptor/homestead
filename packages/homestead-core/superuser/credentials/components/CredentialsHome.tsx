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
import {
  useCreateCredential,
  useCredentials,
  useDeleteCredential,
  useUpdateCredential,
} from '../hooks/useCredentials';
import { CredentialForm } from './CredentialForm';
import type { Credential, CredentialFormData } from '../types';

type Editing = { kind: 'new' } | { kind: 'edit'; credential: Credential } | null;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Set · …3f9a · Oct 26, 2026", or "Not set". */
function valueSummary(credential: Credential): string {
  const value = credential.value;
  if (!value?.set) return 'Not set';
  return ['Set', value.hint, value.set_time ? formatDate(value.set_time) : undefined]
    .filter(Boolean)
    .join(' · ');
}

export function CredentialsHome() {
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Credential | null>(null);

  const { data: credentials, isLoading, isError, error } = useCredentials();
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

      {isError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn’t load credentials: {getAepErrorMessage(error)}
        </div>
      ) : !credentials?.length ? (
        <Card>
          <div className="py-10 text-center" data-testid="credentials-empty">
            <KeyRound className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-gray-600">No credentials yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Add the API keys and tokens your apps and integrations need.
            </p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="credentials-list">
          {credentials.map((credential) => (
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
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing({ kind: 'edit', credential })}
                      aria-label={`Edit ${credential.name}`}
                      data-testid={`edit-credential-${credential.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDeleting(credential)}
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

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete credential"
        message={`Delete “${deleting?.name ?? ''}”? Anything that uses it will stop working. This can’t be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteCredential.isPending}
      />
    </div>
  );
}
