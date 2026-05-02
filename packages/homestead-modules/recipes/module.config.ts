/**
 * Recipes Module Configuration
 *
 * Manages culinary recipes with structured ingredients for scaling.
 * Sidebar visibility is gated by the built-in `enabled` flag — see
 * `useIsModuleEnabled` for the runtime check.
 */

import { ChefHat } from 'lucide-react';
import type { HomeModule } from '@/modules/types';
import { RecipesHome } from './components/RecipesHome';
import { RecipeViewRoute } from './components/RecipeViewRoute';
import { recipesResources } from './resources';

export const recipesModule: HomeModule = {
  id: 'recipes',
  name: 'Recipes',
  description: 'Manage household recipes with structured ingredients.',
  icon: ChefHat,
  basePath: '/recipes',
  routes: [
    { path: '', index: true, component: RecipesHome },
    { path: ':id', component: RecipeViewRoute, dynamic: true },
  ],
  showInNav: true,
  navOrder: 5,
  section: 'Food',
  enabled: true,
  defaultEnabled: 'superusers',
  resources: recipesResources,
  filters: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'tags', label: 'Tags', type: 'enum', multi: true },
  ],
};
