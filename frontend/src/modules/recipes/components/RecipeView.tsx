'use client';

/**
 * Recipe View (Cooking Mode)
 *
 * Read-only presentation of a single recipe optimized for reading while
 * cooking — the whole recipe (ingredients + method) is visible at once on
 * large screens and stacks cleanly on small ones.
 */

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, Pencil } from 'lucide-react';
import { useRecipe } from '../hooks/useRecipe';
import { useUpdateRecipe } from '../hooks/useUpdateRecipe';
import { RecipeForm } from './RecipeForm';
import { PageHeader } from '@/shared/components/PageHeader';
import { logger } from '@/core/utils/logger';
import type { RecipeFormData, RecipeIngredient } from '../types';

interface RecipeViewProps {
  recipeId: string;
}

export function RecipeView({ recipeId }: RecipeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { data: recipe, isLoading, isError, error } = useRecipe(recipeId);
  const updateMutation = useUpdateRecipe();

  const handleSubmit = async (data: RecipeFormData) => {
    try {
      await updateMutation.mutateAsync({ id: recipeId, data });
      setIsEditing(false);
    } catch (err) {
      logger.error('Failed to save recipe', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-accent-terracotta animate-spin" />
      </div>
    );
  }

  if (isError || !recipe) {
    return (
      <div className="space-y-4">
        <Link
          href="/recipes"
          className="inline-flex items-center gap-1 text-sm text-brand-slate hover:text-brand-navy"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to recipes
        </Link>
        <div className="bg-red-50/20 border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-900">Failed to load recipe</h3>
              <p className="text-sm text-red-700">
                {error instanceof Error ? error.message : 'Recipe not found'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="inline-flex items-center gap-1 text-sm text-brand-slate hover:text-brand-navy"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to recipe
        </button>
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit Recipe</h2>
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <RecipeForm
              onSubmit={handleSubmit}
              onCancel={() => setIsEditing(false)}
              initialData={recipe}
              isSubmitting={updateMutation.isPending}
            />
          </div>
        </div>
      </div>
    );
  }

  const ingredients = recipe.parsed_ingredients ?? [];
  const sourceHref = toHref(recipe.source_pointer);

  return (
    <div className="space-y-6">
      <Link
        href="/recipes"
        className="inline-flex items-center gap-1 text-sm text-brand-slate hover:text-brand-navy"
        data-testid="recipe-view-back"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to recipes
      </Link>

      <PageHeader
        title={recipe.title}
        subtitle={
          sourceHref ? (
            <a
              href={sourceHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-text-muted hover:text-brand-navy break-all"
            >
              {recipe.source_pointer}
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          ) : (
            recipe.source_pointer
          )
        }
        actions={
          <button
            onClick={() => setIsEditing(true)}
            data-testid="recipe-view-edit"
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-bg-pearl text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
        }
      />

      {recipe.tags && recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recipe.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block px-2.5 py-1 text-xs rounded-full bg-bg-pearl text-brand-slate"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div
        data-testid="recipe-view"
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6"
      >
        <section
          aria-labelledby="ingredients-heading"
          className="bg-white rounded-lg border border-gray-200 p-5 lg:sticky lg:top-4 lg:self-start"
        >
          <h2
            id="ingredients-heading"
            className="text-xl font-display font-semibold text-brand-navy mb-3"
          >
            Ingredients
          </h2>
          {ingredients.length === 0 ? (
            <p className="text-sm text-text-muted">No ingredients listed.</p>
          ) : (
            <ul data-testid="recipe-view-ingredients" className="space-y-2">
              {ingredients.map((ing, idx) => (
                <li
                  key={`${ing.item}-${idx}`}
                  className="flex items-baseline gap-2 text-base text-brand-navy"
                >
                  <span className="font-medium tabular-nums shrink-0">
                    {formatQty(ing)}
                  </span>
                  <span>{ing.item || ing.raw}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="method-heading"
          className="bg-white rounded-lg border border-gray-200 p-5"
        >
          <h2
            id="method-heading"
            className="text-xl font-display font-semibold text-brand-navy mb-3"
          >
            Method
          </h2>
          {recipe.method ? (
            <div
              data-testid="recipe-view-method"
              className="whitespace-pre-wrap font-body text-base leading-relaxed text-brand-navy"
            >
              {recipe.method}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No method provided.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function formatQty(ing: RecipeIngredient): string {
  const qty = ing.qty > 0 ? String(ing.qty) : '';
  const unit = ing.unit?.trim() ?? '';
  return [qty, unit].filter(Boolean).join(' ');
}

function toHref(source?: string): string | null {
  if (!source) return null;
  try {
    const url = new URL(source);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    // not a URL, fall through
  }
  return null;
}
