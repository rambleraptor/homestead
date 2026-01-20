'use client';

/**
 * Recipe Edit Dialog Component
 *
 * Git-like commit workflow for recipe changes
 */

import { useState } from 'react';
import { X, Loader2, GitCommit } from 'lucide-react';
import { useUpdateRecipe } from '../hooks/useUpdateRecipe';
import { generateRecipeDiff, hasUncommittedChanges } from '../utils/recipeVersioning';
import type { Recipe, Ingredient, RecipeSourceType } from '../types';

interface RecipeEditDialogProps {
  recipe: Recipe;
  isOpen: boolean;
  onClose: () => void;
}

export function RecipeEditDialog({ recipe, isOpen, onClose }: RecipeEditDialogProps) {
  const [formData, setFormData] = useState<Partial<Recipe>>({
    title: recipe.title,
    source_type: recipe.source_type,
    source_reference: recipe.source_reference,
    ingredients: recipe.ingredients || [],
    instructions: recipe.instructions,
    rating: recipe.rating,
  });

  const [commitMessage, setCommitMessage] = useState('');
  const [ingredientInput, setIngredientInput] = useState({ item: '', amount: 0, unit: '', note: '' });

  const updateMutation = useUpdateRecipe();

  const hasChanges = hasUncommittedChanges(recipe, formData);
  const diff = hasChanges ? generateRecipeDiff(recipe, formData) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasChanges) {
      alert('No changes detected');
      return;
    }

    if (!commitMessage.trim()) {
      alert('Please provide a commit message describing your changes');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: recipe.id,
        original: recipe,
        updates: formData,
        commitMessage: commitMessage.trim(),
      });
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  const addIngredient = () => {
    if (!ingredientInput.item || ingredientInput.amount <= 0) return;

    const newIngredient: Ingredient = {
      item: ingredientInput.item,
      amount: ingredientInput.amount,
      unit: ingredientInput.unit,
      note: ingredientInput.note || undefined,
    };

    setFormData({
      ...formData,
      ingredients: [...(formData.ingredients || []), newIngredient],
    });

    setIngredientInput({ item: '', amount: 0, unit: '', note: '' });
  };

  const removeIngredient = (index: number) => {
    setFormData({
      ...formData,
      ingredients: formData.ingredients?.filter((_, i) => i !== index),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <GitCommit className="w-5 h-5" />
              Edit Recipe (Commit Changes)
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Current version: v{recipe.version} → New version: v{recipe.version + 1}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            data-testid="close-recipe-edit"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column - Recipe Data */}
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="edit-title" className="block text-sm font-medium text-gray-700 mb-1">
                  Recipe Title
                </label>
                <input
                  id="edit-title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="edit-title-input"
                />
              </div>

              {/* Source Type */}
              <div>
                <label htmlFor="edit-source-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Source Type
                </label>
                <select
                  id="edit-source-type"
                  value={formData.source_type}
                  onChange={(e) => setFormData({ ...formData, source_type: e.target.value as RecipeSourceType })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="edit-source-type-select"
                >
                  <option value="digital">Digital</option>
                  <option value="physical">Physical</option>
                  <option value="family">Family</option>
                </select>
              </div>

              {/* Source Reference */}
              <div>
                <label htmlFor="edit-source-ref" className="block text-sm font-medium text-gray-700 mb-1">
                  Source Reference
                </label>
                <input
                  id="edit-source-ref"
                  type="text"
                  value={formData.source_reference}
                  onChange={(e) => setFormData({ ...formData, source_reference: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="edit-source-reference-input"
                />
              </div>

              {/* Rating */}
              <div>
                <label htmlFor="edit-rating" className="block text-sm font-medium text-gray-700 mb-1">
                  Rating (1-10)
                </label>
                <input
                  id="edit-rating"
                  type="number"
                  min="1"
                  max="10"
                  value={formData.rating || ''}
                  onChange={(e) => setFormData({ ...formData, rating: parseInt(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="edit-rating-input"
                />
              </div>

              {/* Ingredients */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ingredients
                </label>

                {/* Ingredient List */}
                <div className="mb-3 space-y-1 max-h-40 overflow-y-auto">
                  {formData.ingredients && formData.ingredients.length > 0 ? (
                    formData.ingredients.map((ing, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm bg-gray-50 p-2 rounded">
                        <span className="flex-1 text-xs">
                          {ing.amount} {ing.unit} {ing.item}
                          {ing.note && <span className="text-gray-500"> ({ing.note})</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeIngredient(index)}
                          className="text-red-600 hover:text-red-700 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 italic">No ingredients added</p>
                  )}
                </div>

                {/* Add Ingredient Form */}
                <div className="grid grid-cols-12 gap-1">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Amt"
                    value={ingredientInput.amount || ''}
                    onChange={(e) => setIngredientInput({ ...ingredientInput, amount: parseFloat(e.target.value) || 0 })}
                    className="col-span-2 px-2 py-1 border rounded text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Unit"
                    value={ingredientInput.unit}
                    onChange={(e) => setIngredientInput({ ...ingredientInput, unit: e.target.value })}
                    className="col-span-2 px-2 py-1 border rounded text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Ingredient"
                    value={ingredientInput.item}
                    onChange={(e) => setIngredientInput({ ...ingredientInput, item: e.target.value })}
                    className="col-span-4 px-2 py-1 border rounded text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Note"
                    value={ingredientInput.note}
                    onChange={(e) => setIngredientInput({ ...ingredientInput, note: e.target.value })}
                    className="col-span-3 px-2 py-1 border rounded text-xs"
                  />
                  <button
                    type="button"
                    onClick={addIngredient}
                    className="col-span-1 bg-blue-600 text-white text-xs px-1 py-1 rounded hover:bg-blue-700"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div>
                <label htmlFor="edit-instructions" className="block text-sm font-medium text-gray-700 mb-1">
                  Instructions
                </label>
                <textarea
                  id="edit-instructions"
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-40 text-sm"
                  data-testid="edit-instructions-input"
                />
              </div>
            </div>

            {/* Right Column - Commit Info */}
            <div className="space-y-4">
              {/* Diff Preview */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Changes</h3>
                {hasChanges ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <pre className="text-xs font-mono text-blue-900 whitespace-pre-wrap">
                      {diff}
                    </pre>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                    <p className="text-sm text-gray-500 italic">No changes detected</p>
                  </div>
                )}
              </div>

              {/* Commit Message */}
              <div>
                <label htmlFor="commit-message" className="block text-sm font-medium text-gray-700 mb-1">
                  Commit Message *
                </label>
                <textarea
                  id="commit-message"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Describe what changed and why&#10;&#10;Example:&#10;Doubled garlic and switched to San Marzano tomatoes. The original was too bland and the tomatoes tasted acidic."
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-32 text-sm"
                  required
                  data-testid="commit-message-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Describe what changed and why, like a git commit message
                </p>
              </div>

              {/* Commit Info Box */}
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Commit Info</h4>
                <div className="space-y-1 text-xs text-gray-600">
                  <p>Current version: <span className="font-mono">v{recipe.version}</span></p>
                  <p>New version: <span className="font-mono">v{recipe.version + 1}</span></p>
                  <p>Changelog entries: <span className="font-mono">{(recipe.changelog?.length || 0) + 1}</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending || !hasChanges || !commitMessage.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="commit-recipe-changes"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <GitCommit className="w-4 h-4" />
              {updateMutation.isPending ? 'Committing...' : 'Commit Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
