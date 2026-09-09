/**
 * Bridge — child of the Games app.
 *
 * Sidebar placement is owned by the parent (`gamesApp`); the page itself
 * is gated by this app's own
 * built-in `enabled` flag so it can be turned off independently.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

export const bridgeApp: AppConfig = {
  id: 'bridge',
  name: 'Bridge',
  description: 'Record bids for each hand of Bridge',
  web: {
    icon: () => import('lucide-react').then((m) => m.Club),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/BridgeHome').then((m) => m.BridgeHome),
      },
    ],
  },
};
