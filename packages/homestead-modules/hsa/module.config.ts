/**
 * HSA Module Configuration
 *
 * Module for tracking unreimbursed medical expenses
 */

import type { HomeModule } from '@/modules/types';
import { Receipt } from 'lucide-react';
import { HSAHome } from './components/HSAHome';

export const hsaModule: HomeModule = {
  id: 'hsa',
  name: 'HSA Receipts',
  description: 'Track unreimbursed medical expenses for tax-free HSA withdrawals',
  icon: Receipt,
  basePath: '/hsa',
  routes: [
    { path: '', index: true },
  ],
  showInNav: true,
  navOrder: 4,
  section: 'Money',
  enabled: true,
  omnibox: {
    synonyms: [
      'hsa',
      'medical',
      'receipt',
      'receipts',
      'dental',
      'vision',
      'rx',
      'prescription',
      'doctor',
      'pharmacy',
    ],
    listComponent: HSAHome,
  },
};
