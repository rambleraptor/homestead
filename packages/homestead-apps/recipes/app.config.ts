/**
 * Recipes App Configuration
 *
 * Manages culinary recipes with structured ingredients for scaling.
 * Sidebar visibility is gated by the built-in `enabled` flag — see
 * `useIsAppEnabled` for the runtime check.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { recipesResources } from './resources';

export const recipesApp: AppConfig = {
  id: 'recipes',
  name: 'Recipes',
  description: 'Manage household recipes with structured ingredients.',
  resources: recipesResources,
  chat: {
    instructions: [
      'Tags describe a recipe (cuisine, diet, "quick"); a recipe collection groups ' +
        'recipes someone chose ("Weeknight dinners", "Thanksgiving"). Recipe ' +
        'collections are stored as the "cookbook" resource; when someone mentions a ' +
        'collection of recipes, use that, not a documents collection.',
      'To add or remove recipes in a collection, update its "recipes" list (recipe ' +
        'ids; order does not matter), replacing the whole list. The collection marked ' +
        'auto: "social" is kept by the server for social-post imports; never create ' +
        'another one, delete it, or set "auto" yourself.',
    ],
  },
  // Seed the new "From social" cookbook from recipes already imported from
  // social posts (recognised by their source URL). One-shot and idempotent.
  migrations: [
    {
      id: 'recipes-backfill-social-cookbook',
      title: 'File social-post imports into the From social cookbook',
      load: () => import('./migrations/backfill-social-cookbook'),
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.ChefHat),
    basePath: '/recipes',
    homeScreenIcon: '/app-icons/recipes.png',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/RecipesHome').then((m) => m.RecipesHome),
      },
      // Before `:id`, which would otherwise match "import" / "new" as a recipe
      // id (the matcher prefers routes with more static segments).
      {
        path: 'import',
        component: () => import('./bulk-import').then((m) => m.RecipesBulkImport),
      },
      {
        path: 'collections/:id',
        component: () =>
          import('./components/cookbooks/CookbookRoute').then((m) => m.CookbookRoute),
        dynamic: true,
      },
      {
        path: 'new',
        component: () =>
          import('./components/RecipeFormRoute').then((m) => m.RecipeFormRoute),
      },
      {
        path: ':id',
        component: () =>
          import('./components/RecipeViewRoute').then((m) => m.RecipeViewRoute),
        dynamic: true,
      },
      {
        path: ':id/edit',
        component: () =>
          import('./components/RecipeFormRoute').then((m) => m.RecipeFormRoute),
        dynamic: true,
      },
    ],
    showInNav: true,
    navOrder: 5,
    section: 'Food',
    filters: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'tags', label: 'Tags', type: 'enum', multi: true },
    ],
  },
};
