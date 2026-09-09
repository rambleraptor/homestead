/**
 * Gift Cards App Configuration
 *
 * App for managing household gift cards
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { giftCardsResources } from './resources';

export const giftCardsApp: AppConfig = {
  id: 'gift-cards',
  name: 'Gift Cards',
  description: 'Manage and track household gift cards',
  resources: giftCardsResources,
  web: {
    icon: () => import('lucide-react').then((m) => m.Gift),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/GiftCardHome').then((m) => m.GiftCardHome),
      },
      {
        path: 'import',
        component: () =>
          import('./bulk-import').then((m) => m.GiftCardsBulkImport),
      },
    ],
    showInNav: true,
    navOrder: 4,
    section: 'Money',
  },
};
