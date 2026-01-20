/**
 * Recipes Module Configuration
 *
 * Module for managing recipes with versioning and cooking logs
 */

import type { HomeModule } from '../types';
import { ChefHat } from 'lucide-react';

export const recipesModule: HomeModule = {
  id: 'recipes',
  name: 'Recipes',
  description: 'Manage recipes with git-like versioning and cooking logs',
  icon: ChefHat,
  basePath: '/recipes',
  routes: [{ path: '', index: true }],
  section: 'Food',
  showInNav: true,
  navOrder: 3,
  enabled: true,
};
