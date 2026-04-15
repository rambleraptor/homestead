/**
 * Credit Cards Module Configuration
 *
 * Module for tracking credit card perks and rewards
 */

import type { HomeModule } from '../types';
import { CreditCard } from 'lucide-react';
import { CreditCardsList } from './components/CreditCardsList';

export const creditCardsModule: HomeModule = {
  id: 'credit-cards',
  name: 'Credit Cards',
  description: 'Track credit card perks and maximize rewards',
  icon: CreditCard,
  basePath: '/credit-cards',
  routes: [
    { path: '', index: true },
  ],
  showInNav: true,
  navOrder: 5,
  section: 'Money',
  enabled: true,
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
};
