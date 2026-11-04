/**
 * One cookbook: its strip of siblings, a header with cover and actions, and
 * its recipes in order. Order is the cookbook's meaning, so every row has
 * explicit move-up/move-down controls and a remove; "Add recipes" opens the
 * picker, and "Add all to groceries" puts every member's ingredients on the
 * list through the same hook a single recipe uses.
 */

import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  ShoppingCart,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useDismissOnOutside } from '@rambleraptor/homestead-core/shared/hooks/useDismissOnOutside';
import { useCookbook, useCookbooks, useDeleteCookbook, useUpdateCookbook } from '../../hooks/useCookbooks';
import { useRecipes } from '../../hooks/useRecipes';
import { useAddIngredientsToGroceryList } from '../../hooks/useAddIngredientsToGroceryList';
import { isAutoCookbook, moveRecipe, withRecipe } from '../../utils/cookbooks';
import type { Recipe } from '../../types';
import { RecipeImage } from '../RecipeImage';
import { AddRecipesDialog } from './AddRecipesDialog';
import { CookbookCover } from './CookbookCover';
import { CookbookFormDialog } from './CookbookFormDialog';
import { CookbookStrip } from './CookbookStrip';

interface CookbookPageProps {
  cookbookId: string;
}

const ICON_BUTTON =
  'flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-bg-pearl hover:text-brand-navy disabled:opacity-30 disabled:hover:bg-transparent';

export function CookbookPage({ cookbookId }: CookbookPageProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: cookbook, isLoading, isError, error, refetch } = useCookbook(cookbookId);
  const { data: cookbooks } = useCookbooks();
  const { data: recipes } = useRecipes();
  const update = useUpdateCookbook();
  const remove = useDeleteCookbook();
  const { addIngredients } = useAddIngredientsToGroceryList();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(menuRef, menuOpen, () => setMenuOpen(false));

  // Members in cookbook order; an id whose recipe is gone (or not yet loaded)
  // is skipped rather than shown as a blank row.
  const members = useMemo<Recipe[]>(() => {
    const byId = new Map((recipes ?? []).map((r) => [r.id, r]));
    return (cookbook?.recipes ?? []).flatMap((id) => {
      const recipe = byId.get(id);
      return recipe ? [recipe] : [];
    });
  }, [cookbook?.recipes, recipes]);

  const patchRecipes = async (next: string[]) => {
    if (!cookbook) return;
    try {
      await update.mutateAsync({ id: cookbook.id, data: { recipes: next } });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const move = (recipeId: string, delta: -1 | 1) => {
    const order = cookbook?.recipes ?? [];
    const from = order.indexOf(recipeId);
    void patchRecipes(moveRecipe(order, from, from + delta));
  };

  const handleAddAllToGroceries = () => {
    const ingredients = members.flatMap((r) => r.parsed_ingredients ?? []);
    const { added, skipped } = addIngredients(ingredients);
    if (added === 0) {
      toast.info('All ingredients are already on your grocery list');
      return;
    }
    const noun = added === 1 ? 'ingredient' : 'ingredients';
    const skippedSuffix = skipped > 0 ? `, skipped ${skipped} already on the list` : '';
    toast.success(`Added ${added} ${noun} to grocery list${skippedSuffix}`);
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
    return <SkeletonPage body="list" bodyCount={5} label="Loading cookbook" data-testid="cookbook-loading" />;
  }

  if (isError || !cookbook) {
    return (
      <div className="space-y-4">
        <Link to="/recipes" className="inline-flex items-center gap-1 text-sm text-brand-slate hover:text-brand-navy">
          <ArrowLeft className="w-4 h-4" />
          Back to recipes
        </Link>
        <QueryError
          error={isError ? error : new Error('This cookbook could not be found.')}
          onRetry={isError ? () => void refetch() : undefined}
          title={isError ? 'Failed to load cookbook' : 'Cookbook not found'}
          data-testid="cookbook-error"
        />
      </div>
    );
  }

  const auto = isAutoCookbook(cookbook);
  const count = cookbook.recipes?.length ?? 0;
  const order = cookbook.recipes ?? [];

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
          <button
            type="button"
            onClick={handleAddAllToGroceries}
            disabled={members.length === 0}
            data-testid="cookbook-add-all-to-groceries"
            className="flex items-center gap-2 px-4 py-2 bg-surface-white hover:bg-bg-pearl text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShoppingCart className="w-4 h-4" />
            Add all to groceries
          </button>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Cookbook actions"
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
                className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-gray-200 bg-surface-white p-1 shadow-lg"
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
                    Delete cookbook
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
          title={auto ? 'No imported recipes yet' : 'This cookbook is empty'}
          description={
            auto
              ? 'Recipes imported from social posts will appear here.'
              : 'No recipes yet. Add some to fill this cookbook.'
          }
          action={auto ? undefined : { label: 'Add recipes', onClick: () => setAdding(true), testId: 'cookbook-empty-add' }}
          data-testid="cookbook-empty-state"
        />
      ) : (
        <>
          <p className="text-sm text-text-muted">
            Use the arrows to reorder. The order is what the cookbook shows everywhere.
          </p>
          <ol className="space-y-2" data-testid="cookbook-recipes">
            {members.map((recipe, i) => (
              <li
                key={recipe.id}
                data-testid={`cookbook-recipe-row-${recipe.title}`}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-surface-white px-3 py-2.5"
              >
                <span className="w-6 shrink-0 text-right text-sm text-text-muted">{i + 1}</span>
                <div className="h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-bg-pearl">
                  {recipe.image && (
                    <RecipeImage recipe={recipe} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/recipes/${recipe.id}`}
                    data-testid={`cookbook-recipe-link-${recipe.title}`}
                    className="block truncate font-display text-base font-semibold text-brand-navy hover:text-accent-terracotta"
                  >
                    {recipe.title}
                  </Link>
                  <div className="truncate text-sm text-text-muted">
                    {[recipe.cook_time, recipe.servings && `serves ${recipe.servings}`, recipe.tags?.join(', ')]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(recipe.id, -1)}
                    disabled={i === 0 || update.isPending}
                    aria-label={`Move ${recipe.title} up`}
                    data-testid={`cookbook-recipe-up-${recipe.title}`}
                    className={ICON_BUTTON}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(recipe.id, 1)}
                    disabled={i === order.length - 1 || update.isPending}
                    aria-label={`Move ${recipe.title} down`}
                    data-testid={`cookbook-recipe-down-${recipe.title}`}
                    className={ICON_BUTTON}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void patchRecipes(withRecipe(order, recipe.id, false))}
                    disabled={update.isPending}
                    aria-label={`Remove ${recipe.title} from cookbook`}
                    data-testid={`cookbook-recipe-remove-${recipe.title}`}
                    className={`${ICON_BUTTON} hover:bg-red-50 hover:text-red-600`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </>
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
        title="Delete Cookbook"
        message={`Delete "${cookbook.name}"? The recipes in it stay; only the cookbook goes.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={remove.isPending}
      />
    </div>
  );
}
