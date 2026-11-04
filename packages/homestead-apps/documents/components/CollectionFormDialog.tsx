/**
 * Create or rename a collection: name, optional description, and a colour for
 * the folder chip. Markup unchanged; state/validation/submission run through the
 * shared `useSchemaForm` engine, with `onSubmit` driving the collection CRUD
 * hooks. A thrown mutation surfaces as the form's error and keeps the dialog open.
 */

import { Loader2 } from 'lucide-react';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { useSchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import {
  useCreateCollection,
  useUpdateCollection,
  type CollectionInput,
} from '../hooks/useCollections';
import { documentsResources } from '../resources';
import type { Collection } from '../types';

const collectionDef = documentsResources.find((r) => r.singular === 'collection')!;

/** A small preset palette for folder chips (kept legible on a white row). */
export const COLLECTION_COLORS = [
  '#2563eb', // blue
  '#16a34a', // green
  '#d97706', // amber
  '#dc2626', // red
  '#7c3aed', // violet
  '#0891b2', // cyan
  '#db2777', // pink
  '#4b5563', // slate
] as const;

interface CollectionFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** When present, the dialog edits this collection; otherwise it creates one. */
  collection?: Collection;
  /** Called with the created/updated collection id on success. */
  onSaved?: (id: string) => void;
}

export function CollectionFormDialog({
  isOpen,
  onClose,
  collection,
  onSaved,
}: CollectionFormDialogProps) {
  const editing = !!collection;
  const create = useCreateCollection();
  const update = useUpdateCollection();
  const isSaving = create.isPending || update.isPending;

  const form = useSchemaForm<CollectionInput>({
    resource: collectionDef,
    initialData: {
      name: collection?.name ?? '',
      description: collection?.description ?? '',
      color: collection?.color ?? COLLECTION_COLORS[0],
    },
    fields: {
      name: { id: 'collection-name' },
      description: { id: 'collection-description' },
    },
    buildPayload: (v) => ({
      name: String(v.name).trim(),
      description: String(v.description ?? '').trim() || undefined,
      color: v.color as string,
    }),
    onSubmit: async (input) => {
      if (editing) {
        await update.mutateAsync({ id: collection.id, patch: input });
        onSaved?.(collection.id);
      } else {
        const created = await create.mutateAsync(input);
        onSaved?.(created.id);
      }
      onClose();
    },
  });

  const busy = isSaving || form.isSubmitting;
  const color = (form.values.color as string) ?? COLLECTION_COLORS[0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Rename collection' : 'New collection'}
    >
      <form onSubmit={form.handleSubmit} className="space-y-4" data-testid="collection-form">
        <div>
          <label htmlFor="collection-name" className="block text-xs font-medium text-brand-slate">
            Name
          </label>
          <input
            {...form.register('name')}
            type="text"
            autoFocus
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-terracotta focus:outline-none focus:ring-1 focus:ring-accent-terracotta"
            data-testid="collection-name-input"
          />
        </div>

        <div>
          <label htmlFor="collection-description" className="block text-xs font-medium text-brand-slate">
            Description <span className="text-gray-400">(optional)</span>
          </label>
          <input
            {...form.register('description')}
            type="text"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent-terracotta focus:outline-none focus:ring-1 focus:ring-accent-terracotta"
            data-testid="collection-description-input"
          />
        </div>

        <div>
          <span className="block text-xs font-medium text-brand-slate">Colour</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLLECTION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                aria-pressed={color === c}
                onClick={() => form.setValue('color', c)}
                className={`h-7 w-7 rounded-full border-2 ${
                  color === c ? 'border-gray-900' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                data-testid={`collection-color-${c}`}
              />
            ))}
          </div>
        </div>

        {form.formError && (
          <p className="text-sm text-red-600" data-testid="collection-form-error">
            {form.formError}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !form.isValid} data-testid="collection-form-save">
            {busy && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
            {editing ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
