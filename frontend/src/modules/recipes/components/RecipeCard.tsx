/**
 * Recipe Card Component
 *
 * Displays a recipe card with hybrid digital/physical handling
 */

import { ChefHat, Book, Users, Star, Calendar, GitCommit } from 'lucide-react';
import type { Recipe } from '../types';

interface RecipeCardProps {
  recipe: Recipe;
  onClick: () => void;
}

export function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  const isPhysical = recipe.source_type === 'physical';

  const getSourceIcon = () => {
    switch (recipe.source_type) {
      case 'physical':
        return <Book className="w-4 h-4" />;
      case 'family':
        return <Users className="w-4 h-4" />;
      case 'digital':
      default:
        return <ChefHat className="w-4 h-4" />;
    }
  };

  const formatLastCooked = (date: string | undefined) => {
    if (!date) return 'Never cooked';
    const d = new Date(date);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Cooked today';
    if (diffDays === 1) return 'Cooked yesterday';
    if (diffDays < 7) return `Cooked ${diffDays} days ago`;
    if (diffDays < 30) return `Cooked ${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `Cooked ${Math.floor(diffDays / 30)} months ago`;
    return `Cooked ${Math.floor(diffDays / 365)} years ago`;
  };

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer overflow-hidden"
      data-testid={`recipe-card-${recipe.id}`}
    >
      {/* Header with source type badge */}
      <div className="p-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-gray-900 flex-1 line-clamp-2">
            {recipe.title}
          </h3>
          <div className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-md whitespace-nowrap">
            {getSourceIcon()}
            <span className="capitalize">{recipe.source_type}</span>
          </div>
        </div>
      </div>

      {/* Physical Recipe Display */}
      {isPhysical && (
        <div className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 text-center">
          <Book className="w-16 h-16 mx-auto text-amber-700 mb-3" />
          <p className="text-sm text-gray-600 mb-2">Cookbook Reference</p>
          {recipe.source_reference && (
            <p className="text-2xl font-bold text-amber-900">{recipe.source_reference}</p>
          )}
          <p className="text-xs text-gray-500 mt-3">Click to view details or digitize</p>
        </div>
      )}

      {/* Digital Recipe Preview */}
      {!isPhysical && (
        <div className="p-4 space-y-3">
          {/* Ingredients count */}
          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">{recipe.ingredients.length}</span> ingredients
            </div>
          )}

          {/* Source reference */}
          {recipe.source_reference && (
            <div className="text-xs text-blue-600 truncate">
              {recipe.source_reference}
            </div>
          )}
        </div>
      )}

      {/* Footer with metadata */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between gap-4 text-xs text-gray-600">
          {/* Rating */}
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5" />
            <span>{recipe.rating ? `${recipe.rating}/10` : 'Unrated'}</span>
          </div>

          {/* Version */}
          <div className="flex items-center gap-1">
            <GitCommit className="w-3.5 h-3.5" />
            <span>v{recipe.version}</span>
          </div>

          {/* Last cooked */}
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            <span className="truncate">{formatLastCooked(recipe.last_cooked)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
