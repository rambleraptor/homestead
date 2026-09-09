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
  web: {
    icon: () => import('lucide-react').then((m) => m.ChefHat),
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/RecipesHome').then((m) => m.RecipesHome),
      },
      // Before `:id`, which would otherwise match "import" as a recipe id.
      {
        path: 'import',
        component: () => import('./bulk-import').then((m) => m.RecipesBulkImport),
      },
      {
        path: ':id',
        component: () =>
          import('./components/RecipeViewRoute').then((m) => m.RecipeViewRoute),
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
