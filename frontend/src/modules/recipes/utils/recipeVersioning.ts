/**
 * Recipe Versioning Utilities
 *
 * Git-like versioning system for recipes
 */

import type { Recipe, ChangelogEntry } from '../types';

/**
 * Creates a commit payload for a recipe change
 *
 * This function implements the "git commit" workflow for recipes.
 * It increments the version, adds a changelog entry, and returns
 * the payload ready for PocketBase update.
 *
 * @param original - The current recipe state
 * @param updates - The proposed changes
 * @param message - Commit message describing what changed and why
 * @returns Updated recipe data with new version and changelog
 */
export function commitRecipeChange(
  original: Recipe,
  updates: Partial<Recipe>,
  message: string
): Partial<Recipe> {
  const newVersion = original.version + 1;

  // Create the new changelog entry
  const changelogEntry: ChangelogEntry = {
    date: new Date().toISOString(),
    version: newVersion,
    message,
  };

  // Append to existing changelog
  const updatedChangelog = [...(original.changelog || []), changelogEntry];

  return {
    ...updates,
    version: newVersion,
    changelog: updatedChangelog,
  };
}

/**
 * Generates a diff summary between two recipe versions
 *
 * @param original - The original recipe
 * @param updated - The updated recipe
 * @returns Human-readable summary of changes
 */
export function generateRecipeDiff(
  original: Recipe,
  updated: Partial<Recipe>
): string {
  const changes: string[] = [];

  if (updated.title && updated.title !== original.title) {
    changes.push(`Title: "${original.title}" → "${updated.title}"`);
  }

  if (updated.source_reference && updated.source_reference !== original.source_reference) {
    changes.push(`Source: "${original.source_reference}" → "${updated.source_reference}"`);
  }

  if (updated.ingredients && JSON.stringify(updated.ingredients) !== JSON.stringify(original.ingredients)) {
    changes.push('Ingredients modified');
  }

  if (updated.instructions && updated.instructions !== original.instructions) {
    changes.push('Instructions modified');
  }

  if (updated.rating !== undefined && updated.rating !== original.rating) {
    changes.push(`Rating: ${original.rating || 'unrated'} → ${updated.rating}`);
  }

  return changes.length > 0 ? changes.join('\n') : 'No changes detected';
}

/**
 * Gets the changelog history for a recipe
 *
 * @param recipe - The recipe to get history for
 * @returns Array of changelog entries, newest first
 */
export function getRecipeHistory(recipe: Recipe): ChangelogEntry[] {
  return [...(recipe.changelog || [])].reverse();
}

/**
 * Checks if a recipe has uncommitted changes
 * This would be used if we implement draft/preview functionality
 *
 * @param original - The saved recipe
 * @param draft - The draft version
 * @returns True if there are unsaved changes
 */
export function hasUncommittedChanges(
  original: Recipe,
  draft: Partial<Recipe>
): boolean {
  const fieldsToCheck: (keyof Recipe)[] = [
    'title',
    'source_reference',
    'ingredients',
    'instructions',
    'rating',
  ];

  return fieldsToCheck.some((field) => {
    const draftValue = draft[field];
    const originalValue = original[field];

    if (draftValue === undefined) return false;

    if (typeof draftValue === 'object') {
      return JSON.stringify(draftValue) !== JSON.stringify(originalValue);
    }

    return draftValue !== originalValue;
  });
}

/**
 * Creates an initial recipe with version 1
 *
 * @param recipeData - The initial recipe data
 * @returns Recipe data with version 1 and initial changelog
 */
export function createInitialRecipe(
  recipeData: Partial<Recipe>
): Partial<Recipe> {
  const initialChangelog: ChangelogEntry = {
    date: new Date().toISOString(),
    version: 1,
    message: 'Initial recipe creation',
  };

  return {
    ...recipeData,
    version: 1,
    changelog: [initialChangelog],
  };
}
