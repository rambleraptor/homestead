/**
 * Generic per-record share dialog (design: docs/design/permissions.md §15).
 *
 * Share any single record with household members or groups by writing ordinary
 * record-scope `access-grant` records — the same machinery the documents app's
 * bespoke CollectionShareDialog uses, lifted into core so every app can reuse
 * it. Sharing is *not* custom code: it goes through `useShareRecord` /
 * `useRevokeGrant`, and the engine's manage-on-target rule authorizes the write.
 *
 * The dialog owns exactly one grant per share — the record-scope grant on this
 * record. Resources whose children need to travel with the parent (a folder's
 * documents) supply the `onShare` / `onRevoke` extension seam to write and clean
 * up their extra grants alongside; core stays cascade-agnostic.
 */

import { useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import type { Capability, Effect } from '../resolve';
import { useCan } from '../useCan';
import {
  useAccessGrants,
  useShareableUsers,
  useGroups,
  useRevokeGrant,
  useShareRecord,
  bareId,
  type AccessGrantRecord,
} from '../hooks';

/** The subject a share is addressed to. */
export interface ShareSubject {
  type: 'user' | 'group';
  id: string;
}

/** The resolved capability/effect a share was written at, handed to the seam. */
export interface ShareDetails {
  capability: Capability;
  effect: Effect;
}

export interface ShareRecordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The resource singular, e.g. 'recipe' — the app supplies its own constant. */
  resourceType: string;
  recordId: string;
  /** Human name of the record, for the dialog title. */
  recordName: string;
  /** The record's owner id (bare or `users/<id>`), excluded from the picker. */
  ownerId?: string;
  /** Owning app id, for app-scope grant reasoning in the manage gate. Optional. */
  appId?: string | null;
  /**
   * Extension seam: called after the primary record grant is written, so an app
   * can add cascade grants (e.g. a collection-scope filter grant for children).
   */
  onShare?: (subject: ShareSubject, details: ShareDetails) => Promise<void> | void;
  /**
   * Extension seam: called before the primary record grant is revoked, so an app
   * can remove the extra grants it wrote in `onShare`.
   */
  onRevoke?: (grant: AccessGrantRecord) => Promise<void> | void;
}

const CAPABILITY_LABEL: Record<Capability, string> = {
  read: 'View',
  write: 'Can edit',
  manage: 'Full access',
};

/** The three choices in the Access dropdown: two allow levels plus a block. */
type AccessChoice = 'read' | 'write' | 'blocked';

/** Encode a subject as a single `<select>` value; `parseSubject` is the inverse. */
function subjectValue(type: 'user' | 'group', id: string): string {
  return `${type}:${id}`;
}
function parseSubject(value: string): ShareSubject | null {
  const sep = value.indexOf(':');
  if (sep === -1) return null;
  const type = value.slice(0, sep);
  const id = value.slice(sep + 1);
  if ((type !== 'user' && type !== 'group') || !id) return null;
  return { type, id };
}

export function ShareRecordDialog({
  isOpen,
  onClose,
  resourceType,
  recordId,
  recordName,
  ownerId,
  appId,
  onShare,
  onRevoke,
}: ShareRecordDialogProps) {
  const can = useCan();
  const canManage = can('manage', resourceType, {
    recordId,
    appId: appId ?? null,
    owner: ownerId ? bareId(ownerId) : undefined,
  });

  const { data: grants, isLoading } = useAccessGrants({ resourceType, recordId });
  const { data: users } = useShareableUsers();
  const { data: groups } = useGroups();
  const share = useShareRecord();
  const revoke = useRevokeGrant();

  const [subject, setSubject] = useState('');
  const [access, setAccess] = useState<AccessChoice>('write');
  const [error, setError] = useState<string | null>(null);

  const ownerBareId = ownerId ? bareId(ownerId) : undefined;
  const wantDeny = access === 'blocked';

  // Only record-scope grants for this record set resource_id, so `useAccessGrants`
  // returns exactly the shares for this record.
  const shares = grants ?? [];

  // Candidates depend on the chosen effect: someone already allow-shared can
  // still be blocked (and vice-versa), so only exclude people/groups already
  // holding a grant of the *same* effect the dropdown is about to write.
  const takenSubjectKeys = useMemo(
    () =>
      new Set(
        shares
          .filter((s) => (s.effect === 'deny') === wantDeny)
          .map((s) => `${s.subject_type}:${s.subject_id ?? ''}`),
      ),
    [shares, wantDeny],
  );

  const userOptions = (users ?? []).filter(
    (u) => u.id !== ownerBareId && !takenSubjectKeys.has(`user:${u.id}`),
  );
  const groupOptions = (groups ?? []).filter(
    (g) => !takenSubjectKeys.has(`group:${g.id}`),
  );

  const nameForSubject = (s: AccessGrantRecord): string => {
    if (s.subject_type === 'group') {
      const g = (groups ?? []).find((x) => x.id === s.subject_id);
      return g?.name || `Group ${s.subject_id}`;
    }
    if (s.subject_type === 'everyone') return 'Everyone';
    const u = (users ?? []).find((x) => x.id === s.subject_id);
    return u?.display_name || u?.email || s.subject_id || 'Someone';
  };

  const handleAdd = async () => {
    const parsed = parseSubject(subject);
    if (!parsed) return;
    setError(null);
    try {
      await share.mutateAsync({
        resourceType,
        recordId,
        subject: parsed,
        ...(wantDeny ? { effect: 'deny' as const } : { capability: access as Capability }),
      });
      if (onShare) {
        await onShare(parsed, {
          capability: wantDeny ? 'manage' : (access as Capability),
          effect: wantDeny ? 'deny' : 'allow',
        });
      }
      setSubject('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not share this record.');
    }
  };

  const handleRevoke = async (grant: AccessGrantRecord) => {
    setError(null);
    try {
      if (onRevoke) await onRevoke(grant);
      await revoke.mutateAsync(grant.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke this share.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Share “${recordName}”`}>
      <div className="space-y-5" data-testid="share-record-dialog">
        <p className="text-sm text-gray-500">
          People and groups you share this with can see it. Choose{' '}
          <span className="font-medium">Blocked</span> to keep someone out even if
          another share would otherwise let them in.
        </p>

        {/* Add a person or group — only when the caller can manage this record. */}
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <label htmlFor="share-subject" className="block text-xs font-medium text-gray-700">
                Share with
              </label>
              <select
                id="share-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="share-record-subject"
              >
                <option value="">Select someone…</option>
                {userOptions.length > 0 && (
                  <optgroup label="People">
                    {userOptions.map((u) => (
                      <option key={`user:${u.id}`} value={subjectValue('user', u.id)}>
                        {u.display_name || u.email}
                      </option>
                    ))}
                  </optgroup>
                )}
                {groupOptions.length > 0 && (
                  <optgroup label="Groups">
                    {groupOptions.map((g) => (
                      <option key={`group:${g.id}`} value={subjectValue('group', g.id)}>
                        {g.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label htmlFor="share-access" className="block text-xs font-medium text-gray-700">
                Access
              </label>
              <select
                id="share-access"
                value={access}
                onChange={(e) => setAccess(e.target.value as AccessChoice)}
                className="mt-1 block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="share-record-access"
              >
                <option value="read">View</option>
                <option value="write">Can edit</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
            <Button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!subject || share.isPending}
              data-testid="share-record-add"
            >
              {share.isPending && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
              {wantDeny ? 'Block' : 'Share'}
            </Button>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600" data-testid="share-record-error">
            {error}
          </p>
        )}

        {/* Current shares */}
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">Shared with</h4>
          {isLoading ? (
            <div className="py-4 text-center">
              <Loader2 className="inline h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : shares.length === 0 ? (
            <p className="py-3 text-sm text-gray-500" data-testid="share-record-empty">
              Not shared with anyone yet.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100" data-testid="share-record-list">
              {shares.map((s) => {
                const isDeny = s.effect === 'deny';
                return (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-800">
                      {nameForSubject(s)}
                      <span
                        className={`ml-2 text-xs ${isDeny ? 'font-medium text-red-600' : 'text-gray-400'}`}
                      >
                        {isDeny ? 'Blocked' : CAPABILITY_LABEL[s.capability]}
                      </span>
                    </span>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void handleRevoke(s)}
                        disabled={revoke.isPending}
                        className="inline-flex items-center gap-1 rounded p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                        aria-label={isDeny ? 'Remove block' : 'Revoke access'}
                        data-testid={`share-record-revoke-${s.effect ?? 'allow'}-${s.subject_id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
