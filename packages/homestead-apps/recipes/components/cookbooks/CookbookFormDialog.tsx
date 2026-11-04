/**
 * Create or edit a collection's own fields (name, description). Membership is
 * edited elsewhere — on the collection page and from a recipe's "Add to
 * collection" menu — so this stays a two-field form.
 */

import { Loader2 } from 'lucide-react';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { useSchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { useCreateCookbook, useUpdateCookbook } from '../../hooks/useCookbooks';
import { recipesResources } from '../../resources';
import type { Cookbook, CookbookFormData } from '../../types';

const cookbookDef = recipesResources.find((r) => r.singular === 'cookbook')!;

interface CookbookFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** When present, the dialog edits this cookbook; otherwise it creates one. */
  cookbook?: Cookbook;
  /** Called with the created/updated cookbook id on success. */
  onSaved?: (id: string) => void;
}

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-terracotta';

export function CookbookFormDialog({ isOpen, onClose, cookbook, onSaved }: CookbookFormDialogProps) {
  const editing = !!cookbook;
  const create = useCreateCookbook();
  const update = useUpdateCookbook();

  const form = useSchemaForm<CookbookFormData>({
    resource: cookbookDef,
    initialData: {
      name: cookbook?.name ?? '',
      description: cookbook?.description ?? '',
    },
    fields: {
      name: { id: 'cookbook-name' },
      description: { id: 'cookbook-description' },
    },
    buildPayload: (v) => ({
      name: String(v.name).trim(),
      description: String(v.description ?? '').trim() || undefined,
    }),
    onSubmit: async (input) => {
      if (editing) {
        await update.mutateAsync({ id: cookbook.id, data: input });
        onSaved?.(cookbook.id);
      } else {
        const created = await create.mutateAsync(input);
        onSaved?.(created.id);
      }
      onClose();
    },
  });

  const busy = create.isPending || update.isPending || form.isSubmitting;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit collection' : 'New collection'}>
      <form onSubmit={form.handleSubmit} className="space-y-4" data-testid="cookbook-form">
        <div>
          <label htmlFor="cookbook-name" className="block text-xs font-medium text-brand-slate">
            Name
          </label>
          <input
            {...form.register('name')}
            type="text"
            autoFocus
            className={INPUT_CLASS}
            data-testid="cookbook-name-input"
          />
          {form.errors.name && (
            <p className="mt-1 text-sm text-red-600" data-testid="cookbook-name-error">
              {form.errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="cookbook-description" className="block text-xs font-medium text-brand-slate">
            Description <span className="text-gray-400">(optional)</span>
          </label>
          <input
            {...form.register('description')}
            type="text"
            className={INPUT_CLASS}
            data-testid="cookbook-description-input"
          />
          {form.errors.description && (
            <p className="mt-1 text-sm text-red-600">{form.errors.description}</p>
          )}
        </div>

        {form.formError && (
          <p className="text-sm text-red-600" data-testid="cookbook-form-error">
            {form.formError}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !form.isValid} data-testid="cookbook-form-save">
            {busy && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
            {editing ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
