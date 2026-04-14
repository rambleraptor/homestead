/**
 * Minigolf Module Configuration
 *
 * Module for playing and tracking mini golf games.
 */

import type { HomeModule } from '../types';
import { Flag } from 'lucide-react';

export const minigolfModule: HomeModule = {
  id: 'minigolf',
  name: 'Mini Golf',
  description: 'Play and track mini golf games',
  icon: Flag,
  basePath: '/minigolf',
  routes: [{ path: '', index: true }],
  showInNav: true,
  navOrder: 20,
  section: 'Games',
  enabled: true,
};
