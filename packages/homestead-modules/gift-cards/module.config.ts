/**
 * Gift Cards Module Configuration
 *
 * Module for managing household gift cards
 */

import type { HomeModule } from '@/modules/types';
import { Gift } from 'lucide-react';
import { GiftCardsList } from './components/GiftCardsList';
import { GiftCardHome } from './components/GiftCardHome';
import { GiftCardsBulkImport } from './bulk-import';
import { giftCardsResources } from './resources';

export const giftCardsModule: HomeModule = {
  id: 'gift-cards',
  name: 'Gift Cards',
  description: 'Manage and track household gift cards',
  icon: Gift,
  basePath: '/gift-cards',
  routes: [
    { path: '', index: true, component: GiftCardHome },
    { path: 'import', component: GiftCardsBulkImport },
  ],
  showInNav: true,
  navOrder: 4,
  section: 'Money',
  enabled: true,
  resources: giftCardsResources,
  omnibox: {
    synonyms: [
      'gift',
      'gifts',
      'card',
      'cards',
      'gift-cards',
      'giftcards',
      'redeem',
      'unredeemed',
      'balance',
    ],
    listComponent: GiftCardsList,
  },
};
