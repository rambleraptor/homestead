'use client';

/**
 * Recipe Form Component
 *
 * Create/edit form for recipes. Manages an editable list of structured
 * ingredients (item / qty / unit / raw) inline so users can add or remove
 * rows without leaving the form.
 */

import React, { useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { splitSteps } from '../importers/textImporter';
import type { Recipe, RecipeFormData, RecipeIngredient } from '../types';

interface RecipeFormProps {
  onSubmit: (data: RecipeFormData) => void;
  onCancel: () => void;
  initialData?: Recipe;
  isSubmitting?: boolean;
}

const emptyIngredient = (): RecipeIngredient => ({
  item: '',
  qty: 1,
  unit: '',
  raw: '',
});

export function RecipeForm({
  onSubmit,
  onCancel,
  initialData,
  isSubmitting = false,
}: RecipeFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [sourcePointer, setSourcePointer] = useState(
    initialData?.source_pointer ?? '',
  );
  const [prepTime, setPrepTime] = useState(initialData?.prep_time ?? '');
  const [cookTime, setCookTime] = useState(initialData?.cook_time ?? '');
  const [servings, setServings] = useState(initialData?.servings ?? '');
  const [stepsInput, setStepsInput] = useState(
    (initialData?.steps ?? []).join('\n\n'),
  );
  const [method, setMethod] = useState(initialData?.method ?? '');
  const [tagsInput, setTagsInput] = useState(
    (initialData?.tags ?? []).join(', '),
  );
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>(
    initialData?.parsed_ingredients?.length
      ? initialData.parsed_ingredients
      : [emptyIngredient()],
  );

  const handleIngredientChange = (
    index: number,
    field: keyof RecipeIngredient,
    value: string,
  ) => {
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        if (field === 'qty') {
          const parsed = parseFloat(value);
          return { ...ing, qty: Number.isFinite(parsed) ? parsed : 0 };
        }
        return { ...ing, [field]: value };
      }),
    );
  };

  const addIngredient = () => {
    setIngredients((prev) => [...prev, emptyIngredient()]);
  };

  const removeIngredient = (index: number) => {
    setIngredients((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== index),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedIngredients = ingredients
      .map((ing) => ({
        ...ing,
        item: ing.item.trim(),
        unit: ing.unit.trim(),
        raw: ing.raw.trim() || `${ing.qty} ${ing.unit} ${ing.item}`.trim(),
      }))
      .filter((ing) => ing.item.length > 0);

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const steps = splitSteps(stepsInput);

    onSubmit({
      title: title.trim(),
      source_pointer: sourcePointer.trim() || undefined,
      parsed_ingredients: cleanedIngredients,
      steps: steps.length > 0 ? steps : undefined,
      method: method.trim() || undefined,
      prep_time: prepTime.trim() || undefined,
      cook_time: cookTime.trim() || undefined,
      servings: servings.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
    });
  };

  const canSubmit =
    title.trim().length > 0 &&
    ingredients.some((ing) => ing.item.trim().length > 0) &&
    !isSubmitting;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-brand-navy mb-1">
          Title <span className="text-red-600">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
        />
      </div>

      <div>
        <label
          htmlFor="source_pointer"
          className="block text-sm font-medium text-brand-navy mb-1"
        >
          Source
        </label>
        <input
          id="source_pointer"
          name="source_pointer"
          type="text"
          value={sourcePointer}
          onChange={(e) => setSourcePointer(e.target.value)}
          placeholder="https://... or 'Book: Food Lab pg 124'"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label
            htmlFor="prep_time"
            className="block text-sm font-medium text-brand-navy mb-1"
          >
            Prep Time
          </label>
          <input
            id="prep_time"
            name="prep_time"
            type="text"
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
            placeholder="e.g. 10 mins"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
          />
        </div>
        <div>
          <label
            htmlFor="cook_time"
            className="block text-sm font-medium text-brand-navy mb-1"
          >
            Cook Time
          </label>
          <input
            id="cook_time"
            name="cook_time"
            type="text"
            value={cookTime}
            onChange={(e) => setCookTime(e.target.value)}
            placeholder="e.g. 25 mins"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
          />
        </div>
        <div>
          <label
            htmlFor="servings"
            className="block text-sm font-medium text-brand-navy mb-1"
          >
            Servings
          </label>
          <input
            id="servings"
            name="servings"
            type="text"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            placeholder="e.g. 8 bundles"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-brand-navy">
            Ingredients <span className="text-red-600">*</span>
          </label>
          <button
            type="button"
            onClick={addIngredient}
            data-testid="add-ingredient-button"
            className="flex items-center gap-1 text-sm text-accent-terracotta hover:text-accent-terracotta-hover"
          >
            <Plus className="w-4 h-4" />
            Add ingredient
          </button>
        </div>
        <div className="space-y-2">
          {ingredients.map((ing, index) => (
            <div
              key={index}
              data-testid={`ingredient-row-${index}`}
              className="grid grid-cols-12 gap-2 items-start"
            >
              <input
                type="number"
                step="any"
                value={ing.qty}
                onChange={(e) => handleIngredientChange(index, 'qty', e.target.value)}
                aria-label={`Quantity for ingredient ${index + 1}`}
                data-testid={`ingredient-qty-${index}`}
                className="col-span-2 px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
              />
              <input
                type="text"
                value={ing.unit}
                onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                placeholder="unit"
                aria-label={`Unit for ingredient ${index + 1}`}
                data-testid={`ingredient-unit-${index}`}
                className="col-span-2 px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
              />
              <input
                type="text"
                value={ing.item}
                onChange={(e) => handleIngredientChange(index, 'item', e.target.value)}
                placeholder="ingredient"
                aria-label={`Item for ingredient ${index + 1}`}
                data-testid={`ingredient-item-${index}`}
                className="col-span-7 px-2 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
              />
              <button
                type="button"
                onClick={() => removeIngredient(index)}
                disabled={ingredients.length === 1}
                aria-label={`Remove ingredient ${index + 1}`}
                data-testid={`ingredient-remove-${index}`}
                className="col-span-1 flex items-center justify-center text-text-muted hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="steps" className="block text-sm font-medium text-brand-navy mb-1">
          Steps
        </label>
        <p className="text-xs text-text-muted mb-1">
          One step per paragraph — separate with a blank line. Displayed as a numbered list.
        </p>
        <textarea
          id="steps"
          name="steps"
          data-testid="recipe-form-steps"
          value={stepsInput}
          onChange={(e) => setStepsInput(e.target.value)}
          rows={8}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta font-body text-sm"
        />
      </div>

      <div>
        <label htmlFor="method" className="block text-sm font-medium text-brand-navy mb-1">
          Notes (Markdown)
        </label>
        <textarea
          id="method"
          name="method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          rows={6}
          placeholder="Notes, nutrition info, serving suggestions…"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta font-mono text-sm"
        />
      </div>

      <div>
        <label htmlFor="tags" className="block text-sm font-medium text-brand-navy mb-1">
          Tags (comma-separated)
        </label>
        <input
          id="tags"
          name="tags"
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="vegetarian, dinner, pasta"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex items-center gap-2 px-4 py-2 bg-bg-pearl hover:bg-gray-100 text-brand-navy rounded-lg font-medium transition-colors border border-gray-200"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          data-testid="recipe-form-submit"
          className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {isSubmitting ? 'Saving...' : 'Save Recipe'}
        </button>
      </div>
    </form>
  );
}
