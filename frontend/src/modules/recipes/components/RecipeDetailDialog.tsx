'use client';

/**
 * Recipe Detail Dialog Component
 *
 * Displays recipe details with cooking mode and version history
 */

import { useState } from 'react';
import { X, Book, Star, GitCommit, Play, Edit, Trash2 } from 'lucide-react';
import { useDeleteRecipe } from '../hooks/useDeleteRecipe';
import { useCookingLogs } from '../hooks/useCookingLogs';
import { CookingModeDialog } from './CookingModeDialog';
import { RecipeEditDialog } from './RecipeEditDialog';
import { getRecipeHistory } from '../utils/recipeVersioning';
import type { Recipe } from '../types';

interface RecipeDetailDialogProps {
  recipe: Recipe;
  isOpen: boolean;
  onClose: () => void;
}

export function RecipeDetailDialog({ recipe, isOpen, onClose }: RecipeDetailDialogProps) {
  const [showCookingMode, setShowCookingMode] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const deleteMutation = useDeleteRecipe();
  const { data: cookingLogs = [] } = useCookingLogs(recipe.id);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this recipe? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(recipe.id);
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  const isPhysical = recipe.source_type === 'physical';
  const history = getRecipeHistory(recipe);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-semibold truncate">{recipe.title}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                <span className="capitalize">{recipe.source_type}</span>
                <span>Version {recipe.version}</span>
                {recipe.rating && (
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    {recipe.rating}/10
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              data-testid="close-recipe-detail"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Physical Recipe Display */}
            {isPhysical && (
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-8 text-center border-2 border-amber-200">
                <Book className="w-20 h-20 mx-auto text-amber-700 mb-4" />
                <h3 className="text-lg font-semibold text-amber-900 mb-2">Physical Recipe Reference</h3>
                {recipe.source_reference && (
                  <p className="text-3xl font-bold text-amber-900 mb-4">{recipe.source_reference}</p>
                )}
                <p className="text-sm text-gray-600">
                  This is a reference to a physical cookbook. You can digitize it by editing the recipe.
                </p>
              </div>
            )}

            {/* Digital Recipe Content */}
            {!isPhysical && (
              <>
                {/* Source Reference */}
                {recipe.source_reference && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-1">Source</h3>
                    {recipe.source_type === 'digital' ? (
                      <a
                        href={recipe.source_reference}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                      >
                        {recipe.source_reference}
                      </a>
                    ) : (
                      <p className="text-sm text-gray-600">{recipe.source_reference}</p>
                    )}
                  </div>
                )}

                {/* Ingredients */}
                {recipe.ingredients && recipe.ingredients.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Ingredients</h3>
                    <ul className="space-y-2">
                      {recipe.ingredients.map((ing, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-blue-600 font-medium min-w-0">•</span>
                          <span>
                            <span className="font-medium">
                              {ing.amount} {ing.unit}
                            </span>{' '}
                            {ing.item}
                            {ing.note && <span className="text-gray-500 italic"> ({ing.note})</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Instructions */}
                {recipe.instructions && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Instructions</h3>
                    <div className="prose prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700">
                        {recipe.instructions}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Cooking History */}
            {cookingLogs.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Cooking History ({cookingLogs.length})
                </h3>
                <div className="space-y-2">
                  {cookingLogs.slice(0, 3).map((log) => (
                    <div key={log.id} className="bg-gray-50 rounded p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">
                          {new Date(log.date).toLocaleDateString()}
                        </span>
                        {log.rating && (
                          <span className="flex items-center gap-1 text-yellow-600">
                            <Star className="w-3 h-3 fill-current" />
                            {log.rating}/5
                          </span>
                        )}
                      </div>
                      {log.notes && <p className="text-gray-600">{log.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Version History */}
            {history.length > 1 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <GitCommit className="w-5 h-5" />
                  Version History
                </h3>
                <div className="space-y-2">
                  {history.map((entry) => (
                    <div key={entry.version} className="border-l-2 border-blue-600 pl-4 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold">v{entry.version}</span>
                        <span className="text-gray-500">•</span>
                        <span className="text-gray-600">
                          {new Date(entry.date).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{entry.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-3 p-6 border-t bg-gray-50">
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="text-red-600 hover:bg-red-50 px-4 py-2 rounded-md flex items-center gap-2 disabled:opacity-50"
              data-testid="delete-recipe-button"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEditDialog(true)}
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 flex items-center gap-2"
                data-testid="edit-recipe-button"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => setShowCookingMode(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
                data-testid="start-cooking-button"
              >
                <Play className="w-4 h-4" />
                Start Cooking
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cooking Mode Dialog */}
      {showCookingMode && (
        <CookingModeDialog
          recipe={recipe}
          isOpen={showCookingMode}
          onClose={() => setShowCookingMode(false)}
        />
      )}

      {/* Edit Dialog */}
      {showEditDialog && (
        <RecipeEditDialog
          recipe={recipe}
          isOpen={showEditDialog}
          onClose={() => setShowEditDialog(false)}
        />
      )}
    </>
  );
}
