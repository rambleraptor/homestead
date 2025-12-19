/**
 * Groceries Module Configuration
 *
 * Module for managing household grocery list with AI-powered categorization
 */

import type { HomeModule } from '../types';
import { ShoppingCart } from 'lucide-react';
import { groceriesRoutes } from './routes';

export const groceriesModule: HomeModule = {
  id: 'groceries',
  name: 'Groceries',
  description: 'Manage your grocery list with smart categorization',
  icon: ShoppingCart,
  basePath: '/groceries',
  routes: groceriesRoutes,
  showInNav: true,
  navOrder: 3,
  enabled: true,
};
