/**
 * Pictionary — child of the Games app.
 *
 * Sidebar placement is owned by the parent (`gamesApp`); the page itself
 * is gated by this app's own
 * built-in `enabled` flag so it can be turned off independently.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { pictionaryResources } from './resources';

export const pictionaryApp: AppConfig = {
  id: 'pictionary',
  name: 'Pictionary',
  description: 'Track Pictionary games, teams, and winning words',
  resources: pictionaryResources,
  web: {
    icon: () => import('lucide-react').then((m) => m.Pencil),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/PictionaryHome').then((m) => m.PictionaryHome),
      },
      {
        path: 'leaderboard',
        component: () =>
          import('./components/PictionaryLeaderboard').then(
            (m) => m.PictionaryLeaderboard,
          ),
      },
      {
        path: 'import',
        component: () =>
          import('./bulk-import').then((m) => m.PictionaryBulkImport),
      },
    ],
  },
};
