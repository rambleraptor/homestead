/**
 * Pure helpers over cookbook membership. Membership is the cookbook's ordered
 * `recipes` list, so every operation here returns a new list for a merge-patch
 * (`{ recipes }`), which replaces the whole array.
 */

import type { Cookbook } from '../types';

/** Cookbooks that contain `recipeId`, in the order given. */
export function cookbooksContaining(
  cookbooks: Cookbook[] | undefined,
  recipeId: string,
): Cookbook[] {
  return (cookbooks ?? []).filter((c) => (c.recipes ?? []).includes(recipeId));
}

/** `recipes` with `recipeId` present (appended) or absent. */
export function withRecipe(
  recipes: string[] | undefined,
  recipeId: string,
  member: boolean,
): string[] {
  const current = recipes ?? [];
  const has = current.includes(recipeId);
  if (member) return has ? current : [...current, recipeId];
  return has ? current.filter((id) => id !== recipeId) : current;
}

/** `recipes` with `ids` appended, skipping any already present. */
export function withRecipes(recipes: string[] | undefined, ids: string[]): string[] {
  const next = [...(recipes ?? [])];
  const seen = new Set(next);
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      next.push(id);
    }
  }
  return next;
}

/** `recipes` with the entry at `from` moved to `to`. Out-of-range moves are no-ops. */
export function moveRecipe(recipes: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= recipes.length || to >= recipes.length) {
    return recipes;
  }
  const next = [...recipes];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The server-kept cookbook (social imports) — not something a person deletes.
 * The engine reads an unset field back as `null`, so test for a value.
 */
export function isAutoCookbook(cookbook: Pick<Cookbook, 'auto'>): boolean {
  return cookbook.auto != null;
}

/** The cookbooks before and after `id` in the given order; undefined at the ends. */
export function neighbours(
  cookbooks: Cookbook[],
  id: string,
): { prev?: Cookbook; next?: Cookbook } {
  const i = cookbooks.findIndex((c) => c.id === id);
  if (i === -1) return {};
  return { prev: cookbooks[i - 1], next: cookbooks[i + 1] };
}

/** Alphabetical by name, case-insensitive, stable for equal names. */
export function byName(a: Pick<Cookbook, 'name'>, b: Pick<Cookbook, 'name'>): number {
  return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
}
