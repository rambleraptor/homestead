/**
 * Mini Golf — child of the Games module.
 *
 * Sidebar placement and the omnibox surface are owned by the parent
 * (`gamesModule`); the page itself is gated by this module's own
 * built-in `enabled` flag so it can be turned off independently.
 */

import { Flag } from 'lucide-react';
import type { HomeModule } from '@/modules/types';

export const minigolfModule: HomeModule = {
  id: 'minigolf',
  name: 'Mini Golf',
  description: 'Play and track mini golf games',
  icon: Flag,
  basePath: '/games/minigolf',
  routes: [{ path: '', index: true }],
  enabled: true,
};
