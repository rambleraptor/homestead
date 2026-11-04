/**
 * Cookbook hooks — list, item, and the three writes, all through the shared
 * resource hooks so they land in the offline outbox like every other write.
 *
 * Membership is edited by patching a cookbook's `recipes` list (see
 * `utils/cookbooks.ts` for the list helpers); there is no separate
 * "add recipe" call.
 */

import {
  useResourceCreate,
  useResourceDelete,
  useResourceItem,
  useResourceList,
  useResourceUpdate,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { COOKBOOKS } from '../resources';
import { byName } from '../utils/cookbooks';
import type { Cookbook, CookbookFormData } from '../types';

const APP = 'recipes';
const SINGULAR = 'cookbook';

/** Every cookbook, alphabetical. */
export function useCookbooks() {
  return useResourceList<Cookbook>(APP, SINGULAR, COOKBOOKS, { sort: byName });
}

export function useCookbook(id: string | null) {
  return useResourceItem<Cookbook>(APP, SINGULAR, COOKBOOKS, id);
}

export interface CreateCookbookInput extends CookbookFormData {
  /** Initial members, in order. */
  recipes?: string[];
}

export function useCreateCookbook() {
  const create = useResourceCreate<Cookbook, CreateCookbookInput & { created_by?: string }>(
    APP,
    SINGULAR,
  );
  const stamp = (input: CreateCookbookInput) => {
    const userId = aepbase.getCurrentUser()?.id;
    return {
      name: input.name,
      description: input.description,
      recipes: input.recipes ?? [],
      ...(userId ? { created_by: `users/${userId}` } : {}),
    };
  };
  return {
    ...create,
    mutate: (input: CreateCookbookInput) => create.mutate(stamp(input)),
    mutateAsync: (input: CreateCookbookInput) => create.mutateAsync(stamp(input)),
  };
}

export type CookbookPatch = Partial<CookbookFormData> & { recipes?: string[] };

export function useUpdateCookbook() {
  return useResourceUpdate<Cookbook, CookbookPatch>(APP, SINGULAR);
}

export function useDeleteCookbook() {
  return useResourceDelete(APP, SINGULAR);
}
