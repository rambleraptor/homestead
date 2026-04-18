/**
 * Recipes Module Configuration
 *
 * Manages culinary recipes with structured ingredients for scaling.
 * Sidebar visibility is gated by the `recipes.visibility` flag — see
 * `useCanUseRecipes` for the runtime check.
 */

import { ChefHat } from 'lucide-react';
import type { HomeModule } from '../types';

export const RECIPES_VISIBILITY_OPTIONS = ['superuser', 'all', 'none'] as const;
export type RecipesVisibility = (typeof RECIPES_VISIBILITY_OPTIONS)[number];

export const recipesModule: HomeModule = {
  id: 'recipes',
  name: 'Recipes',
  description: 'Manage household recipes with structured ingredients.',
  icon: ChefHat,
  basePath: '/recipes',
  routes: [
    { path: '', index: true },
    { path: ':id' },
  ],
  showInNav: true,
  navOrder: 5,
  section: 'Food',
  enabled: true,
  flags: {
    visibility: {
      type: 'enum',
      label: 'Recipes visibility',
      description:
        "Who sees the Recipes module in navigation. 'superuser' shows it only to superusers; 'all' shows it to every signed-in user; 'none' hides it from everyone (including superusers).",
      options: RECIPES_VISIBILITY_OPTIONS,
      default: 'superuser',
    },
  },
};
