/**
 * Games — parent app that groups Mini Golf, Pictionary, and
 * Bridge under a single sidebar entry in the Relationships section.
 *
 * Sub-pages are declared via `children` (full `AppConfig`s living
 * in `./<game>/app.config.ts`); the registry handles route
 * aggregation and validation. Adding a new game is "create a child
 * app + add it to `children`" — no manual landing component
 * required.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { minigolfApp } from './minigolf/app.config';
import { pictionaryApp } from './pictionary/app.config';
import { bridgeApp } from './bridge/app.config';

export const gamesApp: AppConfig = {
  id: 'games',
  name: 'Games',
  description: 'Track games you play with the people in your life',
  children: [minigolfApp, pictionaryApp, bridgeApp],
  web: {
    icon: () => import('lucide-react').then((m) => m.Gamepad2),
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./GamesLanding').then((m) => m.GamesLanding),
      },
    ],
    section: 'Relationships',
    showInNav: true,
    navOrder: 22,
  },
};
