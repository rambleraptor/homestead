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
  // How an item looks wherever Homestead shows one it doesn't otherwise draw
  // (an item the assistant added): live, with its checkbox.
  records: {
    grocery: { component: () => import('./components/cards/GroceryCard').then((m) => m.GroceryCard) },
  },
  chat: {
    // A list the assistant read comes back as the list to shop from, by store.
    cards: {
      grocery: {
        component: () => import('./components/cards/GroceryListCard').then((m) => m.GroceryListCard),
        actions: ['list'],
      },
    },
  },
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
    basePath: '/groceries',
    homeScreenIcon: '/app-icons/groceries.png',
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
        summary: () => import('./hooks/useGroceriesSummary'),
        label: 'Groceries',
        component: () =>
          import('./components/GroceriesWidget').then((m) => m.GroceriesWidget),
        order: 10,
      },
    ],
  },
};
