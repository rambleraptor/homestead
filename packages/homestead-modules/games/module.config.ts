/**
 * Games — parent module that groups Mini Golf, Pictionary, and
 * Bridge under a single sidebar entry in the Relationships section.
 *
 * Sub-pages are declared via `children` (full `HomeModule`s living
 * in `./<game>/module.config.ts`); the registry handles route
 * aggregation and validation, and the omnibox `listComponent` is a
 * generic `<NestedModuleLanding>` that auto-renders one card per
 * child. Adding a new game is "create a child module + add it to
 * `children`" — no manual landing component required.
 */

import { Gamepad2 } from 'lucide-react';
import type { HomeModule } from '@/modules/types';
import { makeNestedModuleLanding } from '@/shared/components/makeNestedModuleLanding';
import { minigolfModule } from './minigolf/module.config';
import { pictionaryModule } from './pictionary/module.config';
import { bridgeModule } from './bridge/module.config';

export const gamesModule: HomeModule = {
  id: 'games',
  name: 'Games',
  description: 'Track games you play with the people in your life',
  icon: Gamepad2,
  basePath: '/games',
  routes: [{ path: '', index: true }],
  section: 'Relationships',
  showInNav: true,
  navOrder: 22,
  enabled: true,
  children: [minigolfModule, pictionaryModule, bridgeModule],
  omnibox: {
    synonyms: [
      'games',
      'minigolf',
      'mini-golf',
      'golf',
      'pictionary',
      'drawing',
      'bridge',
      'cards',
      'card-game',
    ],
    listComponent: makeNestedModuleLanding(() => gamesModule),
  },
};
