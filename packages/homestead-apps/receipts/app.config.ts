/**
 * Receipts App Configuration
 *
 * The receipts you keep because the tax code will eventually care: medical
 * expenses paid out of pocket (reimbursable from an HSA, tax-free, whenever you
 * choose) and charitable donations.
 *
 * The medical collection is still `hsa-receipts` on the wire — aepbase has no
 * rename, and the name appears nowhere a user can see it. See
 * `packages/homestead-site/docs/design/receipts.md` §2.2.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { charitableResources } from './charitable/resources';
import { hsaResources } from './medical/resources';

export const receiptsApp: AppConfig = {
  id: 'receipts',
  name: 'Receipts',
  description: 'Medical and charitable receipts, kept for tax time',
  resources: [...hsaResources, ...charitableResources],
  web: {
    icon: () => import('lucide-react').then((m) => m.Receipt),
    basePath: '/receipts',
    homeScreenIcon: '/app-icons/receipts.png',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/ReceiptsHome').then((m) => m.ReceiptsHome),
      },
    ],
    showInNav: true,
    navOrder: 4,
    section: 'Money',
  },
};
