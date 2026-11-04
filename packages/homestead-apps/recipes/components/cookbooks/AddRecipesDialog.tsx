/**
 * Pick recipes to add to a collection: every recipe not already in it,
 * searched by title, ticked, then added in one patch.
 */

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { useUpdateCookbook } from '../../hooks/useCookbooks';
import { withRecipes } from '../../utils/cookbooks';
import type { Cookbook, Recipe } from '../../types';

interface AddRecipesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cookbook: Cookbook;
  recipes: Recipe[] | undefined;
}

export function AddRecipesDialog({ isOpen, onClose, cookbook, recipes }: AddRecipesDialogProps) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const update = useUpdateCookbook();

  const members = useMemo(() => new Set(cookbook.recipes ?? []), [cookbook.recipes]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (recipes ?? [])
      .filter((r) => !members.has(r.id))
      .filter((r) => !q || r.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [recipes, members, query]);

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => (on ? [...prev.filter((p) => p !== id), id] : prev.filter((p) => p !== id)));

  const close = () => {
    setQuery('');
    setPicked([]);
    onClose();
  };

  const submit = async () => {
    try {
      await update.mutateAsync({
        id: cookbook.id,
        data: { recipes: withRecipes(cookbook.recipes, picked) },
      });
      close();
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={`Add recipes to ${cookbook.name}`}>
      <div className="space-y-4" data-testid="add-recipes-dialog">
        <div>
          <label htmlFor="add-recipes-search" className="sr-only">
            Search recipes
          </label>
          <input
            id="add-recipes-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes"
            autoFocus
            data-testid="add-recipes-search"
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
          />
        </div>

        {candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted" data-testid="add-recipes-empty">
            {query ? 'No recipes match.' : 'Every recipe is already in this collection.'}
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
            {candidates.map((recipe) => {
              const on = picked.includes(recipe.id);
              return (
                <li key={recipe.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-bg-pearl">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => toggle(recipe.id, e.target.checked)}
                      data-testid={`add-recipes-option-${recipe.title}`}
                      className="h-4 w-4 accent-accent-terracotta"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-brand-navy">
                      {recipe.title}
                    </span>
                    {recipe.cook_time && (
                      <span className="shrink-0 text-xs text-text-muted">{recipe.cook_time}</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={close} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={picked.length === 0 || update.isPending}
            data-testid="add-recipes-submit"
          >
            {update.isPending && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
            Add {picked.length > 0 ? picked.length : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
