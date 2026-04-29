/**
 * Pictionary — child of the Games module.
 *
 * Visibility, sidebar placement, and the omnibox surface are owned
 * by the parent (`gamesModule`). This config exists so the child
 * has a first-class identity (id, icon, basePath) for the parent's
 * auto-generated landing page and for future extensions.
 */

import { Pencil } from 'lucide-react';
import type { HomeModule } from '../../types';

export const pictionaryModule: HomeModule = {
  id: 'pictionary',
  name: 'Pictionary',
  description: 'Track Pictionary games, teams, and winning words',
  icon: Pencil,
  basePath: '/games/pictionary',
  routes: [{ path: '', index: true }, { path: 'import' }],
  enabled: true,
};
