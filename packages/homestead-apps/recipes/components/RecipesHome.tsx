/**
 * Recipes Home Component
 *
 * Main recipes management interface — list view with inline create / edit
 * form swap, plus delete confirmation.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Download, Plus } from 'lucide-react';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { useRecipes } from '../hooks/useRecipes';
import { useCreateRecipe } from '../hooks/useCreateRecipe';
import { useUpdateRecipe } from '../hooks/useUpdateRecipe';
import { useDeleteRecipe } from '../hooks/useDeleteRecipe';
import { RecipesList } from './RecipesList';
import { RecipeForm } from './RecipeForm';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import {
  FilterBar,
  AppFiltersProvider,
  useFilteredItems,
} from '@rambleraptor/homestead-core/shared/filters';
import { recipesApp } from '../app.config';
import type { Recipe, RecipeFormData } from '../types';

type View = 'list' | 'form';

export function RecipesHome() {
  const [view, setView] = useState<View>('list');
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [recipeToDelete, setRecipeToDelete] = useState<string | null>(null);

  const { data: recipes, isLoading, isError, error } = useRecipes();
  const createMutation = useCreateRecipe();
  const updateMutation = useUpdateRecipe();
  const deleteMutation = useDeleteRecipe();

  const handleAddRecipe = () => {
    setEditingRecipe(null);
    setView('form');
  };

  const handleEditRecipe = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setView('form');
  };

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

  const handleFormSubmit = async (data: RecipeFormData) => {
    try {
      if (editingRecipe) {
        await updateMutation.mutateAsync({ id: editingRecipe.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
      setView('list');
      setEditingRecipe(null);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleFormCancel = () => {
    setView('list');
    setEditingRecipe(null);
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
      {view === 'list' && (
        <>
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
                <button
                  onClick={handleAddRecipe}
                  data-testid="add-recipe-button"
                  className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium font-body transition-colors shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  Add Recipe
                </button>
              </div>
            }
          />

          <AppFiltersProvider
            appId={recipesApp.id}
            decls={recipesApp.web?.filters ?? []}
            items={recipes ?? []}
          >
            <FilterBar />
            <FilteredRecipesList
              onEdit={handleEditRecipe}
              onDelete={handleDeleteRecipe}
            />
          </AppFiltersProvider>
        </>
      )}

      {view === 'form' && (
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            {editingRecipe ? 'Edit Recipe' : 'Add New Recipe'}
          </h2>
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <RecipeForm
              onSubmit={handleFormSubmit}
              onCancel={handleFormCancel}
              initialData={editingRecipe ?? undefined}
              isSubmitting={createMutation.isPending || updateMutation.isPending}
            />
          </div>
        </div>
      )}

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

function FilteredRecipesList({
  onEdit,
  onDelete,
}: {
  onEdit: (recipe: Recipe) => void;
  onDelete: (id: string) => void;
}) {
  const filteredRecipes = useFilteredItems<Recipe>();
  return (
    <RecipesList
      recipes={filteredRecipes}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}
