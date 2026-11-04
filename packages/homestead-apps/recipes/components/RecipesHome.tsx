/**
 * Recipes Home Component
 *
 * The recipes list with filters, plus delete confirmation. Creating and
 * editing live at their own addresses (`/recipes/new`, `/recipes/:id/edit`,
 * see `RecipeFormRoute`), so the list only links to them.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Download, Plus } from 'lucide-react';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { useRecipes } from '../hooks/useRecipes';
import { useDeleteRecipe } from '../hooks/useDeleteRecipe';
import { RecipesList } from './RecipesList';
import { CookbooksRail } from './cookbooks/CookbooksRail';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import {
  FilterBar,
  AppFiltersProvider,
  useFilteredItems,
} from '@rambleraptor/homestead-core/shared/filters';
import { recipesApp } from '../app.config';
import type { Recipe } from '../types';

export function RecipesHome() {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [recipeToDelete, setRecipeToDelete] = useState<string | null>(null);

  const { data: recipes, isLoading, isError, error } = useRecipes();
  const deleteMutation = useDeleteRecipe();

  const handleDeleteRecipe = (id: string) => {
    setRecipeToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (recipeToDelete) {
      await deleteMutation.mutateAsync(recipeToDelete);
      setDeleteConfirmOpen(false);
      setRecipeToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <SkeletonPage
        body="cards"
        label="Loading recipes"
        data-testid="recipes-loading"
      />
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50/20 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Failed to load recipes</h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recipes"
        subtitle="Manage household recipes with structured ingredients."
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/recipes/import"
              data-testid="import-recipe-button"
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-bg-pearl text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200"
            >
              <Download className="w-5 h-5" />
              Import
            </Link>
            <Link
              to="/recipes/new"
              data-testid="add-recipe-button"
              className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium font-body transition-colors shadow-sm"
            >
              <Plus className="w-5 h-5" />
              Add Recipe
            </Link>
          </div>
        }
      />

      <CookbooksRail recipes={recipes} />

      <AppFiltersProvider
        appId={recipesApp.id}
        decls={recipesApp.web?.filters ?? []}
        items={recipes ?? []}
      >
        <FilterBar />
        <FilteredRecipesList onDelete={handleDeleteRecipe} />
      </AppFiltersProvider>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Recipe"
        message="Are you sure you want to delete this recipe? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

function FilteredRecipesList({ onDelete }: { onDelete: (id: string) => void }) {
  const filteredRecipes = useFilteredItems<Recipe>();
  return <RecipesList recipes={filteredRecipes} onDelete={onDelete} />;
}
