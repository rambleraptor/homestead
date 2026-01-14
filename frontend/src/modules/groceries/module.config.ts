/**
 * Groceries Module Configuration
 *
 * Module for managing household grocery list with AI-powered categorization
 */

import type { HomeModule } from '../types';
import { ShoppingCart } from 'lucide-react';

export const groceriesModule: HomeModule = {
  id: 'groceries',
  name: 'Groceries',
  description: 'Manage your grocery list with smart categorization',
  icon: ShoppingCart,
  basePath: '/groceries',
  routes: [{ path: '', index: true }],
  showInNav: true,
  navOrder: 2,
  enabled: true,
};
