/**
 * Groceries Module Configuration
 *
 * Module for managing household grocery list with AI-powered categorization
 */

import type { HomeModule } from '@/modules/types';
import { ShoppingCart } from 'lucide-react';
import { groceriesOmnibox } from './omnibox';
import { GroceriesWidget } from './components/GroceriesWidget';
import { GroceriesHome } from './components/GroceriesHome';
import { groceriesResources } from './resources';
import { storeCascadeDelete } from './offline';

export const groceriesModule: HomeModule = {
  id: 'groceries',
  name: 'Groceries',
  description: 'Manage your grocery list with smart categorization',
  icon: ShoppingCart,
  basePath: '/groceries',
  routes: [{ path: '', index: true, component: GroceriesHome }],
  section: 'Food',
  showInNav: true,
  navOrder: 2,
  enabled: true,
  resources: groceriesResources,
  // Deleting a store re-homes its items under "No Store". Everything
  // else (optimistic shape, body projection, list cache key) is derived
  // from the resource singular by the offline mutation factory.
  offlineOverrides: {
    store: { cascadeDelete: storeCascadeDelete },
  },
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
      label: 'Groceries',
      component: GroceriesWidget,
      order: 10,
    },
  ],
  workers: {
    'process-image': {
      method: 'POST',
      load: () => import('./workers/process-image'),
    },
  },
};
