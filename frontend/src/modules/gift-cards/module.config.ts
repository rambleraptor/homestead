/**
 * Gift Cards Module Configuration
 *
 * Module for managing household gift cards
 */

import type { HomeModule } from '../types';
import { Gift } from 'lucide-react';

export const giftCardsModule: HomeModule = {
  id: 'gift-cards',
  name: 'Gift Cards',
  description: 'Manage and track household gift cards',
  icon: Gift,
  basePath: '/gift-cards',
  routes: [
    { path: '', index: true },
    { path: 'import' },
  ],
  showInNav: true,
  navOrder: 2,
  section: 'Finance',
  enabled: true,
};
