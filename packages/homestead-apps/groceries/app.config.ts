/**
 * Groceries App Configuration
 *
 * App for managing household grocery list with AI-powered categorization
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { groceriesResources } from './resources';

export const groceriesApp: AppConfig = {
  id: 'groceries',
  name: 'Groceries',
  description: 'Manage your grocery list with smart categorization',
  resources: groceriesResources,
  flags: {
    default_store: {
      type: 'string',
      label: 'Default store',
      description:
        'Store id pre-selected when adding new grocery items. Leave blank for no default.',
      default: '',
    },
  },
  web: {
    icon: () => import('lucide-react').then((m) => m.ShoppingCart),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/GroceriesHome').then((m) => m.GroceriesHome),
      },
    ],
    section: 'Food',
    showInNav: true,
    navOrder: 2,
    widgets: [
      {
        id: 'groceries-remaining',
        label: 'Groceries',
        component: () =>
          import('./components/GroceriesWidget').then((m) => m.GroceriesWidget),
        order: 10,
      },
    ],
  },
};
