/**
 * Bridge — child of the Games module.
 *
 * Sidebar placement and the omnibox surface are owned by the parent
 * (`gamesModule`); the page itself is gated by this module's own
 * built-in `enabled` flag so it can be turned off independently.
 */

import { Club } from 'lucide-react';
import type { HomeModule } from '../../types';

export const bridgeModule: HomeModule = {
  id: 'bridge',
  name: 'Bridge',
  description: 'Record bids for each hand of Bridge',
  icon: Club,
  basePath: '/games/bridge',
  routes: [{ path: '', index: true }],
  enabled: true,
};
