'use client';

/**
 * Recipes Home Component
 *
 * Main recipes interface with grid view and filtering
 */

import { useState } from 'react';
import { Plus, ChefHat, Loader2, AlertCircle } from 'lucide-react';
import { useRecipes } from '../hooks/useRecipes';
import { RecipeCard } from './RecipeCard';
import { RecipeFormDialog } from './RecipeFormDialog';
import { RecipeDetailDialog } from './RecipeDetailDialog';
import type { Recipe } from '../types';

export function RecipesHome() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'digital' | 'physical' | 'family'>('all');

  const { data: recipes = [], isLoading, isError, error } = useRecipes();

  const filteredRecipes = recipes.filter((recipe) => {
    if (filterType === 'all') return true;
    return recipe.source_type === filterType;
  });

  const stats = {
    total: recipes.length,
    digital: recipes.filter((r) => r.source_type === 'digital').length,
    physical: recipes.filter((r) => r.source_type === 'physical').length,
    family: recipes.filter((r) => r.source_type === 'family').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-2 text-gray-600">Loading recipes...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-red-600">
          <AlertCircle className="w-8 h-8 mx-auto" />
          <p className="mt-2">Failed to load recipes</p>
          <p className="text-sm mt-1">{error?.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ChefHat className="w-7 h-7" />
            Sous Chef
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Recipe management with versioning and cooking logs
          </p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
          data-testid="add-recipe-button"
        >
          <Plus className="w-5 h-5" />
          Add Recipe
        </button>
      </div>

      {/* Stats and Filters */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="font-semibold text-gray-900">{stats.total}</span>
              <span className="text-gray-600 ml-1">recipes</span>
            </div>
            <div className="h-4 w-px bg-gray-300" />
            <div>
              <span className="font-semibold text-blue-600">{stats.digital}</span>
              <span className="text-gray-600 ml-1">digital</span>
            </div>
            <div>
              <span className="font-semibold text-amber-600">{stats.physical}</span>
              <span className="text-gray-600 ml-1">physical</span>
            </div>
            <div>
              <span className="font-semibold text-purple-600">{stats.family}</span>
              <span className="text-gray-600 ml-1">family</span>
            </div>
          </div>

          <div className="flex gap-2">
            {(['all', 'digital', 'physical', 'family'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filterType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                data-testid={`filter-${type}`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recipe Grid */}
      {filteredRecipes.length === 0 ? (
        <div className="text-center py-12">
          <ChefHat className="w-16 h-16 mx-auto text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No recipes yet</h3>
          <p className="mt-2 text-sm text-gray-600">
            Get started by adding your first recipe
          </p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Add Recipe
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onClick={() => setSelectedRecipe(recipe)}
            />
          ))}
        </div>
      )}

      {/* Create Recipe Dialog */}
      <RecipeFormDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />

      {/* Recipe Detail Dialog */}
      {selectedRecipe && (
        <RecipeDetailDialog
          recipe={selectedRecipe}
          isOpen={!!selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
        />
      )}
    </div>
  );
}
