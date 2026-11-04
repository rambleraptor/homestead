/**
 * Recipes List Component
 *
 * Renders a grid of recipe cards with edit / delete affordances. Pure
 * presentation — data fetching is handled by the caller.
 *
 * The cards arrive as a cascade: each rises into place on a delay set by
 * its index, capped so a long list doesn't keep the last cards waiting.
 * A card's photo carries the recipe's view-transition name, the same name
 * the recipe page puts on its hero, so opening a recipe grows the card's
 * photo into the page rather than cutting to it.
 */

import { Link } from 'react-router-dom';
import { ChefHat, Clock, Pencil, Trash2 } from 'lucide-react';
import { viewTransitionName } from '@rambleraptor/homestead-core/shared/motion/viewTransition';
import type { Recipe } from '../types';
import type { RecipeEditLinkState } from './RecipeFormRoute';
import { RecipeImage } from './RecipeImage';
import { RecipeTags } from './RecipeTags';
import { CookbookChips } from './cookbooks/CookbookChips';

/** Per-card delay in the entrance cascade. */
const CARD_STAGGER_MS = 40;
/** Cards past this index enter together, so a long list isn't a long wait. */
const MAX_STAGGERED_CARDS = 8;

function cardEnterStyle(index: number): React.CSSProperties {
  return { animationDelay: `${Math.min(index, MAX_STAGGERED_CARDS) * CARD_STAGGER_MS}ms` };
}

interface RecipesListProps {
  recipes: Recipe[];
  onDelete: (id: string) => void;
}

export function RecipesList({ recipes, onDelete }: RecipesListProps) {
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
      {recipes.map((recipe, index) => (
        <li
          key={recipe.id}
          data-testid={`recipe-row-${recipe.title}`}
          style={cardEnterStyle(index)}
          className="animate-field-rise bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col relative focus-within:ring-2 focus-within:ring-accent-terracotta hover:shadow-md transition-shadow"
        >
          {recipe.image && (
            <RecipeImage
              recipe={recipe}
              alt={recipe.title}
              style={viewTransitionName('recipe', recipe.id)}
              className="w-full h-40 object-cover rounded-t-lg pointer-events-none"
            />
          )}
          <Link
            to={`/recipes/${recipe.id}`}
            aria-label={`View ${recipe.title}`}
            data-testid={`recipe-view-${recipe.title}`}
            className="absolute inset-0 rounded-lg focus:outline-none"
          />
          <div className="p-4 flex flex-col pointer-events-none">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-display font-semibold text-brand-navy break-words">
                  {recipe.title}
                </h3>
              </div>
              <div className="flex items-center gap-1 pointer-events-auto relative">
                <Link
                  to={`/recipes/${recipe.id}/edit`}
                  state={{ from: 'list' } satisfies RecipeEditLinkState}
                  aria-label={`Edit ${recipe.title}`}
                  data-testid={`recipe-edit-${recipe.title}`}
                  className="p-1.5 rounded-md text-text-muted hover:bg-bg-pearl hover:text-brand-navy"
                >
                  <Pencil className="w-4 h-4" />
                </Link>
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

            {recipe.cook_time && (
              <p className="text-sm text-brand-slate mt-3 inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-text-muted" />
                <span className="text-text-muted">Cook:</span>
                <span className="font-medium text-brand-navy">{recipe.cook_time}</span>
              </p>
            )}

            <RecipeTags
              tags={recipe.tags}
              variant="inline"
              max={3}
              className={recipe.cook_time ? 'mt-1' : 'mt-3'}
            />
            {/* Chips are links, so they sit above the card's overlay link. */}
            <CookbookChips recipeId={recipe.id} max={2} className="relative mt-2 pointer-events-auto" />
          </div>
        </li>
      ))}
    </ul>
  );
}
