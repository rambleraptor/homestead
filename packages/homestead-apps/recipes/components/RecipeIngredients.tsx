/**
 * Ingredient list for the recipe view, rendered under section headings when
 * ingredients carry a `group`. In cook mode each ingredient becomes a toggle
 * you tap to cross off once it's in the pot.
 */

import { Check } from 'lucide-react';
import { decimalToFraction } from '@rambleraptor/homestead-core/shared/utils/fractionUtils';
import { groupIngredients } from '../utils/ingredientGroups';
import type { RecipeIngredient } from '../types';

interface RecipeIngredientsProps {
  ingredients: RecipeIngredient[];
  cookMode: boolean;
  checked: ReadonlySet<number>;
  onToggle: (index: number) => void;
}

export function RecipeIngredients({
  ingredients,
  cookMode,
  checked,
  onToggle,
}: RecipeIngredientsProps) {
  if (ingredients.length === 0) {
    return <p className="text-sm text-text-muted">No ingredients listed.</p>;
  }

  const groups = groupIngredients(ingredients);

  return (
    <div data-testid="recipe-view-ingredients" className="space-y-5">
      {groups.map((group, groupIdx) => (
        <div key={group.name ?? `__ungrouped-${groupIdx}`}>
          {group.name && (
            <h3
              data-testid={`recipe-view-ingredient-group-${groupIdx}`}
              className="text-xs font-semibold uppercase tracking-wider text-brand-slate mb-2"
            >
              {group.name}
            </h3>
          )}
          <ul className={cookMode ? 'space-y-1' : 'space-y-2'}>
            {group.items.map(({ ingredient: ing, index }) => {
              const content = (
                <>
                  <span className="font-medium tabular-nums shrink-0">{formatQty(ing)}</span>
                  <span className="min-w-0">
                    {ing.item || ing.raw}
                    {ing.notes && (
                      <span
                        data-testid={`recipe-view-ingredient-notes-${index}`}
                        className="block text-sm text-text-muted"
                      >
                        {ing.notes}
                      </span>
                    )}
                  </span>
                </>
              );

              if (!cookMode) {
                return (
                  <li
                    key={`${ing.item}-${index}`}
                    className="flex items-baseline gap-2 text-base text-brand-navy"
                  >
                    {content}
                  </li>
                );
              }

              const isChecked = checked.has(index);
              return (
                <li key={`${ing.item}-${index}`}>
                  <button
                    type="button"
                    onClick={() => onToggle(index)}
                    aria-pressed={isChecked}
                    data-testid={`recipe-view-ingredient-${index}`}
                    className={`w-[calc(100%+1rem)] flex items-baseline gap-3 rounded-md px-2 py-2 -mx-2 text-left text-lg transition-colors hover:bg-bg-pearl ${
                      isChecked ? 'text-text-muted line-through' : 'text-brand-navy'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`self-center flex items-center justify-center w-5 h-5 shrink-0 rounded border ${
                        isChecked
                          ? 'bg-accent-terracotta border-accent-terracotta text-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5" />}
                    </span>
                    {content}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function formatQty(ing: RecipeIngredient): string {
  const qty = ing.qty > 0 ? decimalToFraction(ing.qty) : '';
  const unit = ing.unit?.trim() ?? '';
  return [qty, unit].filter(Boolean).join(' ');
}
