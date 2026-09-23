import type { RecipeIngredient } from '../types';

export interface IngredientGroup {
  /** Section heading; undefined for ingredients listed outside any section. */
  name?: string;
  /** Members paired with their index in `parsed_ingredients`. */
  items: Array<{ ingredient: RecipeIngredient; index: number }>;
}

/**
 * Bucket a recipe's ingredients by `group`, in order of each group's first
 * appearance. Members of a group needn't be adjacent — an ingredient added to
 * "For the sauce" at the end of the list still lands under that heading.
 * Group names are compared trimmed and case-insensitively; the first
 * spelling wins as the heading.
 */
export function groupIngredients(ingredients: RecipeIngredient[]): IngredientGroup[] {
  const groups: IngredientGroup[] = [];
  const byKey = new Map<string, IngredientGroup>();

  ingredients.forEach((ingredient, index) => {
    const name = ingredient.group?.trim() || undefined;
    const key = name?.toLowerCase() ?? '';
    let group = byKey.get(key);
    if (!group) {
      group = { name, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push({ ingredient, index });
  });

  return groups;
}
