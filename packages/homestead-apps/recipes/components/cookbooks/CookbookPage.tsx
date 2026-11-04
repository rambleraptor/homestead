/**
 * One collection: its strip of siblings, a header with cover and actions, and
 * its recipes shown the way the library shows them — the same card grid,
 * newest first, with the same search and tag filters. Each card can be taken
 * out of the collection; "Add recipes" opens the picker.
 */

import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useDismissOnOutside } from '@rambleraptor/homestead-core/shared/hooks/useDismissOnOutside';
import {
  AppFiltersProvider,
  FilterBar,
  useAppFilterValues,
  useFilteredItems,
} from '@rambleraptor/homestead-core/shared/filters';
import { useCookbook, useCookbooks, useDeleteCookbook, useUpdateCookbook } from '../../hooks/useCookbooks';
import { useRecipes } from '../../hooks/useRecipes';
import { recipesApp } from '../../app.config';
import { isAutoCookbook, membersOf, withRecipe } from '../../utils/cookbooks';
import type { Recipe } from '../../types';
import { RecipesList } from '../RecipesList';
import { AddRecipesDialog } from './AddRecipesDialog';
import { CookbookCover } from './CookbookCover';
import { CookbookFormDialog } from './CookbookFormDialog';
import { CookbookStrip } from './CookbookStrip';

interface CookbookPageProps {
  cookbookId: string;
}

export function CookbookPage({ cookbookId }: CookbookPageProps) {
  const navigate = useNavigate();
  const { data: cookbook, isLoading, isError, error, refetch } = useCookbook(cookbookId);
  const { data: cookbooks } = useCookbooks();
  const { data: recipes } = useRecipes();
  const update = useUpdateCookbook();
  const remove = useDeleteCookbook();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(menuRef, menuOpen, () => setMenuOpen(false));

  const members = useMemo(() => (cookbook ? membersOf(cookbook, recipes) : []), [cookbook, recipes]);

  const handleRemove = async (recipe: Recipe) => {
    if (!cookbook) return;
    try {
      await update.mutateAsync({
        id: cookbook.id,
        data: { recipes: withRecipe(cookbook.recipes, recipe.id, false) },
      });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleDelete = async () => {
    if (!cookbook) return;
    try {
      await remove.mutateAsync(cookbook.id);
      setDeleting(false);
      navigate('/recipes');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  if (isLoading) {
    return <SkeletonPage body="cards" label="Loading collection" data-testid="cookbook-loading" />;
  }

  if (isError || !cookbook) {
    return (
      <div className="space-y-4">
        <Link to="/recipes" className="inline-flex items-center gap-1 text-sm text-brand-slate hover:text-brand-navy">
          <ArrowLeft className="w-4 h-4" />
          Back to recipes
        </Link>
        <QueryError
          error={isError ? error : new Error('This collection could not be found.')}
          onRetry={isError ? () => void refetch() : undefined}
          title={isError ? 'Failed to load collection' : 'Collection not found'}
          data-testid="cookbook-error"
        />
      </div>
    );
  }

  const auto = isAutoCookbook(cookbook);
  const count = members.length;

  return (
    <div className="space-y-5" data-testid="cookbook-page">
      <Link
        to="/recipes"
        className="inline-flex items-center gap-1 text-sm text-brand-slate hover:text-brand-navy"
        data-testid="cookbook-back"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to recipes
      </Link>

      <CookbookStrip cookbooks={cookbooks ?? [cookbook]} currentId={cookbook.id} />

      <header className="flex flex-wrap items-center gap-5 rounded-2xl border border-gray-100 bg-surface-white p-5">
        <CookbookCover cookbook={cookbook} recipes={recipes} className="h-28 w-28 shrink-0" />
        <div className="min-w-0 flex-1 basis-64 space-y-1">
          <h1 className="font-display text-2xl font-bold text-brand-navy" data-testid="cookbook-title">
            {cookbook.name}
          </h1>
          {cookbook.description && (
            <p className="text-sm text-brand-slate" data-testid="cookbook-description">
              {cookbook.description}
            </p>
          )}
          <p className="text-sm text-text-muted" data-testid="cookbook-count">
            {count} {count === 1 ? 'recipe' : 'recipes'}
            {auto && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-navy px-2 py-0.5 text-[11px] font-semibold text-white">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Auto
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAdding(true)}
            data-testid="cookbook-add-recipes"
            className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium font-body transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add recipes
          </button>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Collection actions"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              data-testid="cookbook-menu"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-surface-white text-brand-navy shadow-sm hover:bg-bg-pearl"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-gray-200 bg-surface-white p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                  data-testid="cookbook-edit"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-brand-navy hover:bg-bg-pearl"
                >
                  <Pencil className="w-4 h-4" />
                  Edit details
                </button>
                {!auto && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleting(true);
                    }}
                    data-testid="cookbook-delete"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete collection
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {members.length === 0 ? (
        <EmptyState
          icon={auto ? Sparkles : BookOpen}
          title={auto ? 'No imported recipes yet' : 'This collection is empty'}
          description={
            auto
              ? 'Recipes imported from social posts will appear here.'
              : 'No recipes yet. Add some to fill this collection.'
          }
          action={auto ? undefined : { label: 'Add recipes', onClick: () => setAdding(true), testId: 'cookbook-empty-add' }}
          data-testid="cookbook-empty-state"
        />
      ) : (
        // Keyed by collection so moving to another one starts with clear filters.
        <AppFiltersProvider
          key={cookbook.id}
          appId={recipesApp.id}
          decls={recipesApp.web?.filters ?? []}
          items={members}
        >
          <FilterBar />
          <FilteredMembers onRemove={handleRemove} />
        </AppFiltersProvider>
      )}

      <AddRecipesDialog
        isOpen={adding}
        onClose={() => setAdding(false)}
        cookbook={cookbook}
        recipes={recipes}
      />
      <CookbookFormDialog isOpen={editing} onClose={() => setEditing(false)} cookbook={cookbook} />
      <ConfirmDialog
        isOpen={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={handleDelete}
        title="Delete Collection"
        message={`Delete "${cookbook.name}"? The recipes in it stay; only the collection goes.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={remove.isPending}
      />
    </div>
  );
}

/** Only rendered when the collection has members, so an empty list means the filters hid them. */
function FilteredMembers({ onRemove }: { onRemove: (recipe: Recipe) => void }) {
  const filtered = useFilteredItems<Recipe>();
  const { reset } = useAppFilterValues();
  return <RecipesList recipes={filtered} onRemove={onRemove} filtered onClearFilters={reset} />;
}
