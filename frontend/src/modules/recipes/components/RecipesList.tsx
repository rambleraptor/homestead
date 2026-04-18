'use client';

/**
 * Recipes List Component
 *
 * Renders a list of recipes with edit / delete affordances. Pure
 * presentation — data fetching is handled by the caller.
 */

import Link from 'next/link';
import { ChefHat, Pencil, Trash2 } from 'lucide-react';
import type { Recipe } from '../types';

interface RecipesListProps {
  recipes: Recipe[];
  onEdit: (recipe: Recipe) => void;
  onDelete: (id: string) => void;
}

export function RecipesList({ recipes, onEdit, onDelete }: RecipesListProps) {
  if (recipes.length === 0) {
    return (
      <div
        data-testid="recipes-empty-state"
        className="text-center py-12 bg-white rounded-lg border border-gray-200"
      >
        <ChefHat className="w-12 h-12 text-text-muted mx-auto mb-3" />
        <p className="text-text-muted">No recipes yet. Add your first one to get started.</p>
      </div>
    );
  }

  return (
    <ul
      data-testid="recipes-list"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      {recipes.map((recipe) => (
        <li
          key={recipe.id}
          data-testid={`recipe-row-${recipe.title}`}
          className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col relative focus-within:ring-2 focus-within:ring-accent-terracotta hover:shadow-md transition-shadow"
        >
          <Link
            href={`/recipes/${recipe.id}`}
            aria-label={`View ${recipe.title}`}
            data-testid={`recipe-view-${recipe.title}`}
            className="absolute inset-0 rounded-lg focus:outline-none"
          />
          <div className="p-4 flex flex-col pointer-events-none">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-display font-semibold text-brand-navy truncate">
                  {recipe.title}
                </h3>
                {recipe.source_pointer && (
                  <p className="text-xs text-text-muted truncate mt-0.5">
                    {recipe.source_pointer}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 pointer-events-auto relative">
                <button
                  type="button"
                  onClick={() => onEdit(recipe)}
                  aria-label={`Edit ${recipe.title}`}
                  data-testid={`recipe-edit-${recipe.title}`}
                  className="p-1.5 rounded-md text-text-muted hover:bg-bg-pearl hover:text-brand-navy"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(recipe.id)}
                  aria-label={`Delete ${recipe.title}`}
                  data-testid={`recipe-delete-${recipe.title}`}
                  className="p-1.5 rounded-md text-text-muted hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-sm text-brand-slate mt-3">
              {recipe.parsed_ingredients?.length ?? 0} ingredient
              {(recipe.parsed_ingredients?.length ?? 0) === 1 ? '' : 's'}
            </p>

            {recipe.tags && recipe.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {recipe.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block px-2 py-0.5 text-xs rounded-full bg-bg-pearl text-brand-slate"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
