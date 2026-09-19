/**
 * Collections: folder-like groupings of documents, plus the sharing that rides
 * on the permissions system.
 *
 * Membership lives on the document (`Document.collections`), so this file owns
 * collection CRUD, a membership setter, and the *document half* of sharing.
 *
 * Sharing a collection writes two ordinary `access-grant` records:
 *   1. a record-scope grant on the `collection` (so the sharee sees the folder)
 *   2. a collection-scope grant on `document` filtered by `'<id>' in collections`
 *      (so the sharee sees the documents in it — this is what the engine's `in`
 *      operator enables).
 * The generic `ShareRecordDialog` owns grant #1 and the shared-with list; the
 * seam helpers here ride its onShare/onRevoke callbacks to add and remove grant
 * #2. The engine's manage-on-target rule authorizes both, so a plain member can
 * create/organize collections but only someone who can manage documents (a
 * superuser/admin) can actually share.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryClient, queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { ACCESS_GRANTS } from '@rambleraptor/homestead-core/permissions/resources';
import type { AccessGrantRecord } from '@rambleraptor/homestead-core/permissions/hooks';
import type { Capability, Effect } from '@rambleraptor/homestead-core/permissions/resolve';
import { COLLECTIONS } from '../resources';
import type { Collection } from '../types';
import { invalidateDocuments } from './useDocuments';

export const collectionKeys = queryKeys.app('documents').resource('collection');

/** The document-visibility grant filter for a collection: `'<id>' in collections`. */
export function collectionDocumentFilter(collectionId: string): string {
  return `'${collectionId}' in collections`;
}

/** Alphabetical by name. */
export function useCollections() {
  return useQuery({
    queryKey: collectionKeys.list(),
    queryFn: async () => {
      const collections = await aepbase.list<Collection>(COLLECTIONS);
      return [...collections].sort((a, b) =>
        (a.name ?? '').localeCompare(b.name ?? ''),
      );
    },
  });
}

async function invalidateCollections(): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: collectionKeys.all() });
}

export interface CollectionInput {
  name: string;
  description?: string;
  color?: string;
}

export function useCreateCollection() {
  return useMutation({
    mutationFn: async (input: CollectionInput): Promise<Collection> => {
      const created = await aepbase.create<Collection>(COLLECTIONS, {
        name: input.name,
        description: input.description,
        color: input.color,
        created_by: aepbase.getCurrentUser()?.id,
      });
      await invalidateCollections();
      return created;
    },
  });
}

export function useUpdateCollection() {
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<CollectionInput>;
    }): Promise<Collection> => {
      const updated = await aepbase.update<Collection>(COLLECTIONS, id, patch);
      await invalidateCollections();
      return updated;
    },
  });
}

export function useDeleteCollection() {
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // The `collections` reference declares onDelete: set-null, so the engine
      // drops this id from every document's membership array on delete. Any
      // share grants are cleaned up by the caller (unshare) before deleting.
      await aepbase.remove(COLLECTIONS, id);
      await invalidateCollections();
      await invalidateDocuments();
    },
  });
}

/**
 * Replace a document's collection membership. Merge-patch replaces the whole
 * array, so callers pass the full desired set (see `toggleMembership`).
 */
export function useSetDocumentCollections() {
  return useMutation({
    mutationFn: async ({
      documentId,
      collections,
    }: {
      documentId: string;
      collections: string[];
    }): Promise<void> => {
      const { DOCUMENTS } = await import('../resources');
      await aepbase.update(DOCUMENTS, documentId, { collections });
      await invalidateDocuments();
    },
  });
}

/** Add or remove `collectionId` from a membership list, returning a new array. */
export function toggleMembership(
  current: string[] | undefined,
  collectionId: string,
  member: boolean,
): string[] {
  const set = new Set(current ?? []);
  if (member) set.add(collectionId);
  else set.delete(collectionId);
  return [...set];
}

// ─────────────────── Sharing: the document cascade seam ───────────────────

// The generic ShareRecordDialog writes the collection *record* grant (folder
// visibility) and lists who a collection is shared with. These two helpers ride
// its onShare/onRevoke seam to add and remove the paired collection-scope
// `in`-filter grant on documents, so a sharee also sees the docs in the folder.

export interface ShareCollectionDocumentsInput {
  collectionId: string;
  subject: { type: 'user' | 'group'; id: string };
  /** Matches the capability the record grant was shared at ('read'/'write'/'manage'). */
  capability: Capability;
  /** 'allow' shares the documents; 'deny' blocks them (written at manage upstream). */
  effect: Effect;
}

/** Seam writer: the collection-scope document grant paired to a folder share. */
export function useShareCollectionDocuments() {
  return useMutation({
    mutationFn: async (input: ShareCollectionDocumentsInput): Promise<void> => {
      await aepbase.create<AccessGrantRecord>(ACCESS_GRANTS, {
        subject_type: input.subject.type,
        subject_id: input.subject.id,
        capability: input.capability,
        // Only stamp effect for a deny; the wire schema defaults to allow, so an
        // allow share stays byte-identical to the pre-deny payload.
        ...(input.effect === 'deny' ? { effect: 'deny' as const } : {}),
        target_scope: 'collection',
        resource_type: 'document',
        filter: collectionDocumentFilter(input.collectionId),
      });
    },
  });
}

export interface UnshareCollectionDocumentsInput {
  collectionId: string;
  /** The collection record grant being revoked; its paired doc grant is removed. */
  grant: AccessGrantRecord;
}

/** Seam revoker: delete the document grant paired to a revoked folder share. */
export function useUnshareCollectionDocuments() {
  return useMutation({
    mutationFn: async ({
      collectionId,
      grant,
    }: UnshareCollectionDocumentsInput): Promise<void> => {
      const docFilter = collectionDocumentFilter(collectionId);
      const effectOf = (g: AccessGrantRecord): Effect => g.effect ?? 'allow';
      const grants = await aepbase.list<AccessGrantRecord>(ACCESS_GRANTS);
      // Match the doc grant to this share by subject *and* effect, so an allow
      // and a deny for the same person don't cross-delete.
      const paired = grants.find(
        (g) =>
          g.target_scope === 'collection' &&
          g.resource_type === 'document' &&
          g.filter === docFilter &&
          g.subject_type === grant.subject_type &&
          g.subject_id === grant.subject_id &&
          effectOf(g) === effectOf(grant),
      );
      if (paired) await aepbase.remove(ACCESS_GRANTS, paired.id);
    },
  });
}
