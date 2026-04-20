/**
 * Bridge Module Configuration
 *
 * Records individual hands of Bridge with the final bid for each of the
 * four cardinal directions (N, S, E, W).
 */

import type { HomeModule } from '../types';
import { Club } from 'lucide-react';
import { BridgeHome } from './components/BridgeHome';

export const bridgeModule: HomeModule = {
  id: 'bridge',
  name: 'Bridge',
  description: 'Record bids for each hand of Bridge',
  icon: Club,
  basePath: '/bridge',
  routes: [{ path: '', index: true }],
  showInNav: true,
  navOrder: 21,
  section: 'Games',
  enabled: true,
  omnibox: {
    synonyms: ['bridge', 'cards', 'card-game', 'hand', 'hands'],
    listComponent: BridgeHome,
  },
};
