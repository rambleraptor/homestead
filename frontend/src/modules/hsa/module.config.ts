/**
 * HSA Module Configuration
 *
 * Module for tracking unreimbursed medical expenses
 */

import type { HomeModule } from '../types';
import { Receipt } from 'lucide-react';

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
  section: 'Finance',
  enabled: true,
};
