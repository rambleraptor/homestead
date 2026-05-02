/**
 * Groceries Module Configuration
 *
 * Module for managing household grocery list with AI-powered categorization
 */

import type { HomeModule } from '@/modules/types';
import { ShoppingCart } from 'lucide-react';
import { groceriesOmnibox } from './omnibox';
import { GroceriesWidget } from './components/GroceriesWidget';

export const groceriesModule: HomeModule = {
  id: 'groceries',
  name: 'Groceries',
  description: 'Manage your grocery list with smart categorization',
  icon: ShoppingCart,
  basePath: '/groceries',
  routes: [{ path: '', index: true }],
  section: 'Food',
  showInNav: true,
  navOrder: 2,
  enabled: true,
  omnibox: groceriesOmnibox,
  flags: {
    default_store: {
      type: 'string',
      label: 'Default store',
      description:
        'Store id pre-selected when adding new grocery items. Leave blank for no default.',
      default: '',
    },
  },
  widgets: [
    {
      id: 'groceries-remaining',
      component: GroceriesWidget,
      order: 10,
    },
  ],
};
