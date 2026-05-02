/**
 * Pictionary — child of the Games module.
 *
 * Sidebar placement and the omnibox surface are owned by the parent
 * (`gamesModule`); the page itself is gated by this module's own
 * built-in `enabled` flag so it can be turned off independently.
 */

import { Pencil } from 'lucide-react';
import type { HomeModule } from '@/modules/types';

export const pictionaryModule: HomeModule = {
  id: 'pictionary',
  name: 'Pictionary',
  description: 'Track Pictionary games, teams, and winning words',
  icon: Pencil,
  basePath: '/games/pictionary',
  routes: [{ path: '', index: true }, { path: 'import' }],
  enabled: true,
};
