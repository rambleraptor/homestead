/**
 * The automatic "From social" cookbook.
 *
 * Server-only (under `methods/`, so the client build stubs it out). Every
 * recipe imported from a social post lands in one cookbook, marked
 * `auto: 'social'`, created on first use. Both the import saver and the
 * backfill migration go through here, so there is one definition of what the
 * cookbook is called and how recipes are appended to it.
 */

import type { HomesteadClient } from '@rambleraptor/homestead-client';
import { COOKBOOKS, SOCIAL_COOKBOOK } from '../resources';
import type { Cookbook } from '../types';

export const SOCIAL_COOKBOOK_NAME = 'From social';
export const SOCIAL_COOKBOOK_DESCRIPTION =
  'Recipes imported from TikTok, Instagram and YouTube posts. Filed here automatically.';

/** The social cookbook, or undefined if no social import has happened yet. */
export async function findSocialCookbook(client: HomesteadClient): Promise<Cookbook | undefined> {
  const [cookbook] = await client
    .collection<Cookbook>(COOKBOOKS)
    .listAll({ filter: `auto == "${SOCIAL_COOKBOOK}"` });
  return cookbook;
}

/**
 * The social cookbook, created if it doesn't exist yet. `createdBy` is the
 * person whose import caused it (an AEP resource path, `users/{id}`), or
 * nobody for the boot-time backfill.
 */
export async function ensureSocialCookbook(
  client: HomesteadClient,
  createdBy?: string,
): Promise<Cookbook> {
  const existing = await findSocialCookbook(client);
  if (existing) return existing;
  return client.collection<Cookbook>(COOKBOOKS).create({
    name: SOCIAL_COOKBOOK_NAME,
    description: SOCIAL_COOKBOOK_DESCRIPTION,
    recipes: [],
    auto: SOCIAL_COOKBOOK,
    ...(createdBy ? { created_by: createdBy } : {}),
  });
}

/** `current` with `ids` appended, in order, skipping any already present. */
export function appendRecipeIds(current: string[] | undefined, ids: string[]): string[] {
  const next = [...(current ?? [])];
  const seen = new Set(next);
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

/**
 * Append recipes to the social cookbook (creating it on first use). A no-op
 * when there is nothing to add, so a failed import never creates an empty
 * cookbook. Returns the number of recipes newly filed.
 */
export async function fileInSocialCookbook(
  client: HomesteadClient,
  recipeIds: string[],
  createdBy?: string,
): Promise<number> {
  if (recipeIds.length === 0) return 0;
  const cookbook = await ensureSocialCookbook(client, createdBy);
  const recipes = appendRecipeIds(cookbook.recipes, recipeIds);
  const added = recipes.length - (cookbook.recipes?.length ?? 0);
  if (added === 0) return 0;
  await client.collection<Cookbook>(COOKBOOKS).record(cookbook.id).update({ recipes });
  return added;
}
