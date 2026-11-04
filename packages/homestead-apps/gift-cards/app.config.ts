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
    basePath: '/gift-cards',
    homeScreenIcon: '/app-icons/gift-cards.png',
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
      {
        path: 'new',
        component: () =>
          import('./components/GiftCardFormRoute').then((m) => m.GiftCardFormRoute),
      },
      {
        path: 'cards/:id/edit',
        component: () =>
          import('./components/GiftCardFormRoute').then((m) => m.GiftCardFormRoute),
        dynamic: true,
      },
      // The merchant name is percent-encoded in the address (`merchantHref`).
      {
        path: 'merchants/:merchant',
        component: () =>
          import('./components/MerchantDetailRoute').then((m) => m.MerchantDetailRoute),
        dynamic: true,
      },
    ],
    showInNav: true,
    navOrder: 4,
    section: 'Money',
  },
};
