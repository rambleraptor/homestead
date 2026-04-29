/**
 * Games Module Configuration
 *
 * Combines Mini Golf and Pictionary into a single Games module under
 * the Relationships section. The landing page links to each game's
 * sub-page; each sub-page lives at `/games/<game>` in the App Router.
 */

import { Gamepad2 } from 'lucide-react';
import type { HomeModule } from '../types';
import { GamesHome } from './components/GamesHome';

export const gamesModule: HomeModule = {
  id: 'games',
  name: 'Games',
  description: 'Track games you play with the people in your life',
  icon: Gamepad2,
  basePath: '/games',
  routes: [
    { path: '', index: true },
    { path: 'minigolf' },
    { path: 'pictionary' },
    { path: 'pictionary/import' },
  ],
  section: 'Relationships',
  showInNav: true,
  navOrder: 22,
  enabled: true,
  omnibox: {
    synonyms: [
      'games',
      'minigolf',
      'mini-golf',
      'golf',
      'pictionary',
      'drawing',
    ],
    listComponent: GamesHome,
  },
};
