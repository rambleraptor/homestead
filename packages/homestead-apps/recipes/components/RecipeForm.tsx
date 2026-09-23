/**
 * Recipe Form Component
 *
 * Create/edit form for recipes. The markup is unchanged — an inline editable
 * ingredient list, a text-edited steps/tags experience, and a bespoke photo
 * input — but state, validation, and submission now run through the shared
 * `useSchemaForm` engine. `steps`/`tags` are edited as free text via extra
 * fields and split in `buildPayload`; the "title + ≥1 ingredient" rule is
 * expressed as cross-field validation, so the submit button reflects it and
 * `onSubmit` never fires while the form is invalid.
 */

import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { useSchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { splitSteps } from '../importers/textImporter';
import { RecipeImage } from './RecipeImage';
import { recipesResources } from '../resources';
import type { Recipe, RecipeFormData, RecipeIngredient } from '../types';

const recipeDef = recipesResources.find((r) => r.singular === 'recipe')!;

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

/**
 * Coerce a stored ingredient into a complete, string-safe row. Records written
 * outside this form (the chat/MCP tools, importers, older data) can omit
 * fields the schema doesn't mark required — `unit`, `raw`, and `qty` in
 * particular — so we backfill them before they reach state.
 */
const normalizeIngredient = (ing: Partial<RecipeIngredient>): RecipeIngredient => ({
  item: ing.item ?? '',
  qty: typeof ing.qty === 'number' && Number.isFinite(ing.qty) ? ing.qty : 0,
  unit: ing.unit ?? '',
  notes: ing.notes,
  raw: ing.raw ?? '',
  group: ing.group,
});

export function RecipeForm({
  onSubmit,
  onCancel,
  initialData,
  isSubmitting = false,
}: RecipeFormProps) {
  const initial = {
    title: initialData?.title ?? '',
    source_pointer: initialData?.source_pointer ?? '',
    prep_time: initialData?.prep_time ?? '',
    cook_time: initialData?.cook_time ?? '',
    servings: initialData?.servings ?? '',
    method: initialData?.method ?? '',
    parsed_ingredients: initialData?.parsed_ingredients?.length
      ? initialData.parsed_ingredients.map(normalizeIngredient)
      : [emptyIngredient()],
    steps_text: (initialData?.steps ?? []).join('\n\n'),
    tags_text: (initialData?.tags ?? []).join(', '),
    image: null as File | null,
  };

  const form = useSchemaForm<RecipeFormData>({
    resource: recipeDef,
    initialData: initial,
    onSubmit,
    fields: {
      title: { id: 'title' },
      source_pointer: { id: 'source_pointer' },
      prep_time: { id: 'prep_time' },
      cook_time: { id: 'cook_time' },
      servings: { id: 'servings' },
      method: { id: 'method' },
      steps_text: { id: 'steps' },
      tags_text: { id: 'tags' },
      // Schema array fields are driven by the text extras above, not rendered.
      steps: { hidden: true },
      tags: { hidden: true },
    },
    extraFields: {
      steps_text: { type: 'string' },
      tags_text: { type: 'string' },
    },
    // The photo aside, a recipe needs a title and at least one named ingredient.
    validate: (values) =>
      (values.parsed_ingredients as RecipeIngredient[]).some((ing) => ing.item.trim().length > 0)
        ? null
        : { parsed_ingredients: 'Add at least one ingredient' },
    buildPayload: (values) => {
      const parsed_ingredients = (values.parsed_ingredients as RecipeIngredient[])
        .map((ing) => ({
          ...ing,
          item: ing.item.trim(),
          unit: ing.unit.trim(),
          notes: ing.notes?.trim() || undefined,
          group: ing.group?.trim() || undefined,
          raw: ing.raw.trim() || `${ing.qty} ${ing.unit} ${ing.item}`.trim(),
        }))
        .filter((ing) => ing.item.length > 0);
      const tags = String(values.tags_text ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const steps = splitSteps(String(values.steps_text ?? ''));
      return {
        title: String(values.title).trim(),
        source_pointer: String(values.source_pointer ?? '').trim() || undefined,
        parsed_ingredients,
        steps: steps.length > 0 ? steps : undefined,
        method: String(values.method ?? '').trim() || undefined,
        prep_time: String(values.prep_time ?? '').trim() || undefined,
        cook_time: String(values.cook_time ?? '').trim() || undefined,
        servings: String(values.servings ?? '').trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        image: (values.image as File | null) ?? undefined,
      };
    },
  });

  const busy = isSubmitting || form.isSubmitting;
  const ingredients = (form.values.parsed_ingredients as RecipeIngredient[]) ?? [];
  const setIngredients = (next: RecipeIngredient[]) => form.setValue('parsed_ingredients', next);
  const image = (form.values.image as File | null) ?? null;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const handleIngredientChange = (
    index: number,
    field: keyof RecipeIngredient,
    value: string,
  ) => {
    setIngredients(
      ingredients.map((ing, i) => {
        if (i !== index) return ing;
        if (field === 'qty') {
          const parsed = parseFloat(value);
          return { ...ing, qty: Number.isFinite(parsed) ? parsed : 0 };
        }
        return { ...ing, [field]: value };
      }),
    );
  };

  // A new row continues the section of the row above it, so filling in a
  // "For the sauce" block doesn't mean retyping the heading on every line.
  const addIngredient = () => {
    const group = ingredients[ingredients.length - 1]?.group?.trim();
    setIngredients([...ingredients, { ...emptyIngredient(), ...(group ? { group } : {}) }]);
  };

  const groupNames = [
    ...new Set(ingredients.map((ing) => ing.group?.trim()).filter((g): g is string => !!g)),
  ];

  const removeIngredient = (index: number) => {
    if (ingredients.length === 1) return;
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-brand-navy mb-1">
          Title <span className="text-red-600">*</span>
        </label>
        <input
          {...form.register('title')}
          type="text"
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
          {...form.register('source_pointer')}
          type="text"
          placeholder="https://... or 'Book: Food Lab pg 124'"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
        />
      </div>

      <div>
        <label htmlFor="image" className="block text-sm font-medium text-brand-navy mb-1">
          Photo
        </label>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Selected recipe photo"
            className="w-full max-h-64 object-cover rounded-md border border-gray-200 mb-2"
          />
        ) : initialData?.image ? (
          <RecipeImage
            recipe={initialData}
            alt={initialData.title}
            className="w-full max-h-64 object-cover rounded-md border border-gray-200 mb-2"
          />
        ) : null}
        <div className="flex items-center gap-3">
          <input
            id="image"
            name="image"
            type="file"
            accept="image/*"
            data-testid="recipe-form-image"
            onChange={(e) => form.setValue('image', e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-brand-slate file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-accent-terracotta file:text-white file:font-medium hover:file:bg-accent-terracotta-hover"
          />
          {image && (
            <button
              type="button"
              onClick={() => form.setValue('image', null)}
              className="text-sm text-text-muted hover:text-red-600 whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
        {initialData?.image && !image && (
          <p className="mt-1 text-xs text-text-muted">
            Uploading a new photo replaces the current one.
          </p>
        )}
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
            {...form.register('prep_time')}
            type="text"
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
            {...form.register('cook_time')}
            type="text"
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
            {...form.register('servings')}
            type="text"
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
        <p className="text-xs text-text-muted mb-2">
          Give ingredients a section (e.g. &ldquo;For the sauce&rdquo;) to list them under
          their own heading.
        </p>
        <datalist id="recipe-ingredient-groups">
          {groupNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
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
              <input
                type="text"
                value={ing.group ?? ''}
                onChange={(e) => handleIngredientChange(index, 'group', e.target.value)}
                placeholder="section (optional)"
                aria-label={`Section for ingredient ${index + 1}`}
                data-testid={`ingredient-group-${index}`}
                list="recipe-ingredient-groups"
                className="col-span-4 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
              />
              <input
                type="text"
                value={ing.notes ?? ''}
                onChange={(e) => handleIngredientChange(index, 'notes', e.target.value)}
                placeholder="notes (substitutions, prep, etc.)"
                aria-label={`Notes for ingredient ${index + 1}`}
                data-testid={`ingredient-notes-${index}`}
                className="col-span-7 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
              />
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
          {...form.register('steps_text')}
          data-testid="recipe-form-steps"
          rows={8}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta font-body text-sm"
        />
      </div>

      <div>
        <label htmlFor="method" className="block text-sm font-medium text-brand-navy mb-1">
          Notes (Markdown)
        </label>
        <textarea
          {...form.register('method')}
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
          {...form.register('tags_text')}
          type="text"
          placeholder="vegetarian, dinner, pasta"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 bg-bg-pearl hover:bg-gray-100 text-brand-navy rounded-lg font-medium transition-colors border border-gray-200"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !form.isValid}
          data-testid="recipe-form-submit"
          className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {busy ? 'Saving...' : 'Save Recipe'}
        </button>
      </div>
    </form>
  );
}
