/**
 * Recipe View (Cooking Mode)
 *
 * Read-only presentation of a single recipe optimized for reading while
 * cooking — the whole recipe (ingredients + method) is visible at once on
 * large screens and stacks cleanly on small ones.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ChefHat,
  Clock,
  CookingPot,
  ExternalLink,
  Pencil,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { useRecipe } from '../hooks/useRecipe';
import { useUpdateRecipe } from '../hooks/useUpdateRecipe';
import { useAddIngredientsToGroceryList } from '../hooks/useAddIngredientsToGroceryList';
import { RecipeForm } from './RecipeForm';
import { RecipeImage } from './RecipeImage';
import { RecipeIngredients } from './RecipeIngredients';
import { RecipeSteps } from './RecipeSteps';
import { isWakeLockSupported, useWakeLock } from '../hooks/useWakeLock';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import type { RecipeFormData } from '../types';

interface RecipeViewProps {
  recipeId: string;
}

export function RecipeView({ recipeId }: RecipeViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [cookMode, setCookMode] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const { data: recipe, isLoading, isError, error } = useRecipe(recipeId);
  const updateMutation = useUpdateRecipe();
  const { addIngredients, isPending: isAddingToGroceries } =
    useAddIngredientsToGroceryList();
  const toast = useToast();
  const wakeLock = useWakeLock(cookMode, (err) => toast.error(err));

  const toggleCookMode = () => {
    // Leaving cook mode clears your place, so the next cook starts fresh.
    if (cookMode) {
      setCheckedIngredients(new Set());
      setCurrentStep(null);
    }
    setCookMode(!cookMode);
  };

  const toggleIngredient = (index: number) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleSubmit = async (data: RecipeFormData) => {
    try {
      await updateMutation.mutateAsync({ id: recipeId, data });
      setIsEditing(false);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  if (isLoading) {
    return (
      <SkeletonPage
        body="list"
        bodyCount={6}
        label="Loading recipe"
        data-testid="recipe-loading"
      />
    );
  }

  if (isError || !recipe) {
    return (
      <div className="space-y-4">
        <Link
          to="/recipes"
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
  const steps = recipe.steps ?? [];
  const sourceHref = toHref(recipe.source_pointer);
  const hasMeta = Boolean(recipe.prep_time || recipe.cook_time || recipe.servings);

  const handleAddToGroceries = () => {
    const { added, skipped } = addIngredients(ingredients);
    if (added === 0) {
      toast.info('All ingredients are already on your grocery list');
      return;
    }
    const noun = added === 1 ? 'ingredient' : 'ingredients';
    const skippedSuffix = skipped > 0 ? `, skipped ${skipped} already on the list` : '';
    toast.success(`Added ${added} ${noun} to grocery list${skippedSuffix}`);
  };

  return (
    <div className="space-y-6">
      <Link
        to="/recipes"
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleCookMode}
              aria-pressed={cookMode}
              data-testid="recipe-view-cook-mode"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium font-body transition-colors shadow-sm border ${
                cookMode
                  ? 'bg-accent-terracotta hover:bg-accent-terracotta-hover text-white border-accent-terracotta'
                  : 'bg-white hover:bg-bg-pearl text-brand-navy border-gray-200'
              }`}
            >
              <CookingPot className="w-4 h-4" />
              {cookMode ? 'Exit cook mode' : 'Cook mode'}
            </button>
            <button
              onClick={handleAddToGroceries}
              disabled={ingredients.length === 0 || isAddingToGroceries}
              data-testid="recipe-view-add-to-groceries"
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-bg-pearl text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShoppingCart className="w-4 h-4" />
              Add to grocery list
            </button>
            <button
              onClick={() => setIsEditing(true)}
              data-testid="recipe-view-edit"
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-bg-pearl text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
          </div>
        }
      />

      {cookMode && (
        <div
          role="status"
          data-testid="recipe-view-cook-mode-banner"
          className="rounded-lg border border-accent-terracotta/40 bg-bg-pearl px-4 py-3 text-sm text-brand-navy"
        >
          Cook mode is on
          {wakeLock === 'held'
            ? ' — your screen will stay awake. '
            : !isWakeLockSupported() || wakeLock === 'failed'
              ? ", but your screen can't be kept awake. "
              : '. '}
          Tap ingredients to check them off and tap a step to mark your place.
        </div>
      )}

      {recipe.image && !cookMode && (
        <RecipeImage
          recipe={recipe}
          alt={recipe.title}
          className="w-full max-h-96 object-cover rounded-lg border border-gray-200"
        />
      )}

      {hasMeta && (
        <div
          data-testid="recipe-view-meta"
          className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-brand-slate"
        >
          {recipe.prep_time && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-text-muted" />
              <span className="text-text-muted">Prep:</span>
              <span className="font-medium text-brand-navy">{recipe.prep_time}</span>
            </span>
          )}
          {recipe.cook_time && (
            <span className="inline-flex items-center gap-1.5">
              <ChefHat className="w-4 h-4 text-text-muted" />
              <span className="text-text-muted">Cook:</span>
              <span className="font-medium text-brand-navy">{recipe.cook_time}</span>
            </span>
          )}
          {recipe.servings && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-4 h-4 text-text-muted" />
              <span className="text-text-muted">Serves:</span>
              <span className="font-medium text-brand-navy">{recipe.servings}</span>
            </span>
          )}
        </div>
      )}

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
          <RecipeIngredients
            ingredients={ingredients}
            cookMode={cookMode}
            checked={checkedIngredients}
            onToggle={toggleIngredient}
          />
        </section>

        <section
          aria-labelledby="method-heading"
          className="bg-white rounded-lg border border-gray-200 p-5 space-y-6"
        >
          <div>
            <h2
              id="method-heading"
              className="text-xl font-display font-semibold text-brand-navy mb-5"
            >
              Steps
            </h2>
            <RecipeSteps
              steps={steps}
              cookMode={cookMode}
              currentStep={currentStep}
              onSelectStep={setCurrentStep}
            />
          </div>

          {recipe.method && (
            <div>
              <h3 className="text-base font-display font-semibold text-brand-navy mb-2">
                Notes
              </h3>
              <div
                data-testid="recipe-view-method"
                className="whitespace-pre-wrap font-body text-base leading-relaxed text-brand-navy"
              >
                {recipe.method}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
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
