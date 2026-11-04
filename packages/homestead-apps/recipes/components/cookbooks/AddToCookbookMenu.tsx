/**
 * "Add to cookbook" on a recipe page: a popover with one checkbox per
 * cookbook (ticks save as you go, no confirm step) and a one-line form to
 * start a new cookbook with this recipe in it. The automatic "From social"
 * cookbook is shown but can't be ticked or unticked by hand.
 */

import { useRef, useState, type FormEvent } from 'react';
import { BookPlus, Loader2, Sparkles } from 'lucide-react';
import { useDismissOnOutside } from '@rambleraptor/homestead-core/shared/hooks/useDismissOnOutside';
import { useCookbooks, useCreateCookbook, useUpdateCookbook } from '../../hooks/useCookbooks';
import { isAutoCookbook, withRecipe } from '../../utils/cookbooks';
import type { Recipe } from '../../types';

interface AddToCookbookMenuProps {
  recipe: Recipe;
}

export function AddToCookbookMenu({ recipe }: AddToCookbookMenuProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const { data: cookbooks, isError } = useCookbooks();
  const update = useUpdateCookbook();
  const create = useCreateCookbook();

  useDismissOnOutside(ref, open, () => setOpen(false));

  const setMember = async (cookbookId: string, member: boolean) => {
    const cookbook = cookbooks?.find((c) => c.id === cookbookId);
    if (!cookbook) return;
    try {
      await update.mutateAsync({
        id: cookbookId,
        data: { recipes: withRecipe(cookbook.recipes, recipe.id, member) },
      });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const createWithRecipe = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      await create.mutateAsync({ name, recipes: [recipe.id] });
      setNewName('');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="recipe-view-add-to-cookbook"
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium font-body transition-colors shadow-sm border ${
          open
            ? 'bg-accent-terracotta/10 border-accent-terracotta text-accent-terracotta-hover'
            : 'bg-white hover:bg-bg-pearl text-brand-navy border-gray-200'
        }`}
      >
        <BookPlus className="w-4 h-4" />
        Add to cookbook
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Add to cookbook"
          data-testid="add-to-cookbook-menu"
          className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
        >
          {isError && (
            <p className="px-2 py-1 text-sm text-red-700">Failed to load cookbooks.</p>
          )}
          {cookbooks && cookbooks.length === 0 && (
            <p className="px-2 py-2 text-sm text-text-muted">No cookbooks yet. Start one below.</p>
          )}
          <ul className="max-h-64 overflow-y-auto">
            {(cookbooks ?? []).map((cookbook) => {
              const auto = isAutoCookbook(cookbook);
              const checked = (cookbook.recipes ?? []).includes(recipe.id);
              return (
                <li key={cookbook.id}>
                  <label
                    className={`flex min-h-[44px] items-center gap-3 rounded-lg px-2 py-1.5 ${
                      auto ? 'text-text-muted' : 'cursor-pointer hover:bg-bg-pearl'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={auto || update.isPending}
                      onChange={(e) => setMember(cookbook.id, e.target.checked)}
                      aria-label={auto ? `${cookbook.name} (automatic)` : cookbook.name}
                      data-testid={`add-to-cookbook-option-${cookbook.name}`}
                      className="h-4 w-4 accent-accent-terracotta"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{cookbook.name}</span>
                    {auto ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        AUTO
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">{cookbook.recipes?.length ?? 0}</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>

          <form onSubmit={createWithRecipe} className="mt-1 flex gap-1.5 border-t border-gray-100 px-1 pt-2">
            <label htmlFor="add-to-cookbook-new-name" className="sr-only">
              New cookbook name
            </label>
            <input
              id="add-to-cookbook-new-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New cookbook…"
              data-testid="add-to-cookbook-new-name"
              className="min-w-0 flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
            />
            <button
              type="submit"
              disabled={!newName.trim() || create.isPending}
              data-testid="add-to-cookbook-create"
              className="rounded-md bg-accent-terracotta px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-terracotta-hover disabled:opacity-50"
            >
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </button>
          </form>
          <p className="px-2 pb-1 pt-1.5 text-xs text-text-muted">Changes save as you tick.</p>
        </div>
      )}
    </div>
  );
}
