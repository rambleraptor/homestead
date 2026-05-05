/**
 * Credit Cards Module Configuration
 *
 * Module for tracking credit card perks and rewards
 */

import type { HomeModule } from '@/modules/types';
import { CreditCard } from 'lucide-react';
import { CreditCardsList } from './components/CreditCardsList';
import { CreditCardsHome } from './components/CreditCardsHome';
import { UpcomingPerksWidget } from './components/UpcomingPerksWidget';
import { creditCardsResources } from './resources';

export const creditCardsModule: HomeModule = {
  id: 'credit-cards',
  name: 'Credit Cards',
  description: 'Track credit card perks and maximize rewards',
  icon: CreditCard,
  basePath: '/credit-cards',
  routes: [{ path: '', index: true, component: CreditCardsHome }],
  showInNav: true,
  navOrder: 5,
  section: 'Money',
  enabled: true,
  resources: creditCardsResources,
  // Only the top-level `credit-card` resource gets generic offline
  // CRUD defaults. Perks + redemptions are nested under credit-cards
  // and need parent-id wiring; they retain their hand-written hooks
  // until the factory's nested-resource path lands.
  offlineOverrides: {
    perk: false,
    redemption: false,
  },
  omnibox: {
    synonyms: [
      'credit',
      'card',
      'cards',
      'perk',
      'perks',
      'rewards',
      'chase',
      'amex',
    ],
    listComponent: CreditCardsList,
  },
  widgets: [
    {
      id: 'credit-cards-upcoming-perks',
      label: 'Upcoming credit card perks',
      component: UpcomingPerksWidget,
      order: 20,
    },
  ],
};
