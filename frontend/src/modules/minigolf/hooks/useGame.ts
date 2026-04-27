/**
 * Single game hook. Reads one game by id.
 */

import { AepCollections } from '@/core/api/aepbase';
import { useAepGet } from '@/core/api/resourceHooks';
import type { Game } from '../types';

export function useGame(gameId: string | null) {
  return useAepGet<Game>(AepCollections.GAMES, gameId, { moduleId: 'minigolf' });
}
