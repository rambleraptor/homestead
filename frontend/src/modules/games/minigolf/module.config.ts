/**
 * Mini Golf — child of the Games module.
 *
 * Visibility, sidebar placement, and the omnibox surface are owned
 * by the parent (`gamesModule`). This config exists so the child
 * has a first-class identity (id, icon, basePath) for the parent's
 * auto-generated landing page and for future extensions.
 */

import { Flag } from 'lucide-react';
import type { HomeModule } from '../../types';

export const minigolfModule: HomeModule = {
  id: 'minigolf',
  name: 'Mini Golf',
  description: 'Play and track mini golf games',
  icon: Flag,
  basePath: '/games/minigolf',
  routes: [{ path: '', index: true }],
  enabled: true,
};
