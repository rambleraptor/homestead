/**
 * Bridge — child of the Games module.
 *
 * Visibility, sidebar placement, and the omnibox surface are owned
 * by the parent (`gamesModule`). This config exists so the child
 * has a first-class identity (id, icon, basePath) for the parent's
 * auto-generated landing page and for future extensions.
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
