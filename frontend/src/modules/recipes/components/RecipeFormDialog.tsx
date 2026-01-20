'use client';

/**
 * Recipe Form Dialog Component
 *
 * Form for creating and editing recipes
 */

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useCreateRecipe } from '../hooks/useCreateRecipe';
import type { RecipeFormData, RecipeSourceType, Ingredient } from '../types';

interface RecipeFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RecipeFormDialog({ isOpen, onClose }: RecipeFormDialogProps) {
  const [formData, setFormData] = useState<RecipeFormData>({
    title: '',
    source_type: 'digital',
    source_reference: '',
    ingredients: [],
    instructions: '',
    rating: undefined,
  });

  const [ingredientInput, setIngredientInput] = useState({ item: '', amount: 0, unit: '', note: '' });

  const createMutation = useCreateRecipe();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      onClose();
      // Reset form
      setFormData({
        title: '',
        source_type: 'digital',
        source_reference: '',
        ingredients: [],
        instructions: '',
        rating: undefined,
      });
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
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Add Recipe</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            data-testid="close-recipe-form"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Recipe Title *
            </label>
            <input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              data-testid="recipe-title-input"
            />
          </div>

          {/* Source Type */}
          <div>
            <label htmlFor="source_type" className="block text-sm font-medium text-gray-700 mb-1">
              Source Type *
            </label>
            <select
              id="source_type"
              value={formData.source_type}
              onChange={(e) => setFormData({ ...formData, source_type: e.target.value as RecipeSourceType })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="source-type-select"
            >
              <option value="digital">Digital (URL/Online)</option>
              <option value="physical">Physical (Cookbook/Print)</option>
              <option value="family">Family Recipe</option>
            </select>
          </div>

          {/* Source Reference */}
          <div>
            <label htmlFor="source_reference" className="block text-sm font-medium text-gray-700 mb-1">
              Source Reference
              <span className="text-gray-500 font-normal ml-1">
                {formData.source_type === 'digital' && '(URL)'}
                {formData.source_type === 'physical' && '(Book name, Page number)'}
                {formData.source_type === 'family' && '(Person name)'}
              </span>
            </label>
            <input
              id="source_reference"
              type="text"
              value={formData.source_reference}
              onChange={(e) => setFormData({ ...formData, source_reference: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={
                formData.source_type === 'digital'
                  ? 'https://example.com/recipe'
                  : formData.source_type === 'physical'
                  ? 'The Food Lab, Page 245'
                  : 'Grandma Smith'
              }
              data-testid="source-reference-input"
            />
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ingredients
            </label>

            {/* Ingredient List */}
            {formData.ingredients && formData.ingredients.length > 0 && (
              <div className="mb-3 space-y-1">
                {formData.ingredients.map((ing, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm bg-gray-50 p-2 rounded">
                    <span className="flex-1">
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
                ))}
              </div>
            )}

            {/* Add Ingredient Form */}
            <div className="grid grid-cols-12 gap-2">
              <input
                type="number"
                step="0.1"
                placeholder="Amount"
                value={ingredientInput.amount || ''}
                onChange={(e) => setIngredientInput({ ...ingredientInput, amount: parseFloat(e.target.value) || 0 })}
                className="col-span-2 px-2 py-1.5 border rounded text-sm"
              />
              <input
                type="text"
                placeholder="Unit"
                value={ingredientInput.unit}
                onChange={(e) => setIngredientInput({ ...ingredientInput, unit: e.target.value })}
                className="col-span-2 px-2 py-1.5 border rounded text-sm"
              />
              <input
                type="text"
                placeholder="Ingredient"
                value={ingredientInput.item}
                onChange={(e) => setIngredientInput({ ...ingredientInput, item: e.target.value })}
                className="col-span-4 px-2 py-1.5 border rounded text-sm"
              />
              <input
                type="text"
                placeholder="Note (optional)"
                value={ingredientInput.note}
                onChange={(e) => setIngredientInput({ ...ingredientInput, note: e.target.value })}
                className="col-span-3 px-2 py-1.5 border rounded text-sm"
              />
              <button
                type="button"
                onClick={addIngredient}
                className="col-span-1 bg-blue-600 text-white text-xs px-2 py-1.5 rounded hover:bg-blue-700"
              >
                +
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label htmlFor="instructions" className="block text-sm font-medium text-gray-700 mb-1">
              Instructions
            </label>
            <textarea
              id="instructions"
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-32"
              placeholder="Cooking instructions (markdown supported)"
              data-testid="instructions-input"
            />
          </div>

          {/* Rating */}
          <div>
            <label htmlFor="rating" className="block text-sm font-medium text-gray-700 mb-1">
              Initial Rating (1-10)
            </label>
            <input
              id="rating"
              type="number"
              min="1"
              max="10"
              value={formData.rating || ''}
              onChange={(e) => setFormData({ ...formData, rating: parseInt(e.target.value) || undefined })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="rating-input"
            />
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
              disabled={createMutation.isPending || !formData.title}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="submit-recipe-button"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {createMutation.isPending ? 'Creating...' : 'Create Recipe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
