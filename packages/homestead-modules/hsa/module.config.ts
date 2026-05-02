/**
 * HSA Module Configuration
 *
 * Module for tracking unreimbursed medical expenses
 */

import type { HomeModule } from '@/modules/types';
import { Receipt } from 'lucide-react';
import { HSAHome } from './components/HSAHome';
import { hsaResources } from './resources';

export const hsaModule: HomeModule = {
  id: 'hsa',
  name: 'HSA Receipts',
  description: 'Track unreimbursed medical expenses for tax-free HSA withdrawals',
  icon: Receipt,
  basePath: '/hsa',
  routes: [{ path: '', index: true, component: HSAHome }],
  showInNav: true,
  navOrder: 4,
  section: 'Money',
  enabled: true,
  resources: hsaResources,
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
