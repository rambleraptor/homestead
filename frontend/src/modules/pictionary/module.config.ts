/**
 * Pictionary Module Configuration
 *
 * Track Pictionary game sessions: who played, what teams, who won, and
 * the winning word.
 */

import type { HomeModule } from '../types';
import { Pencil } from 'lucide-react';
import { PictionaryHome } from './components/PictionaryHome';

export const pictionaryModule: HomeModule = {
  id: 'pictionary',
  name: 'Pictionary',
  description: 'Track Pictionary games, teams, and winning words',
  icon: Pencil,
  basePath: '/pictionary',
  routes: [{ path: '', index: true }, { path: 'import' }],
  showInNav: true,
  navOrder: 21,
  section: 'Games',
  enabled: true,
  omnibox: {
    synonyms: ['pictionary', 'drawing', 'game', 'games'],
    listComponent: PictionaryHome,
  },
};
