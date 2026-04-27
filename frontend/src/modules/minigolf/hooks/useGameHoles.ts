/**
 * Holes list hook. Holes live at `/games/{gameId}/holes` — parent id is
 * part of the URL, not a stored field.
 */

import { AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { useAepList } from '@/core/api/resourceHooks';
import type { Hole } from '../types';

export function useGameHoles(gameId: string | null) {
  return useAepList<Hole>(AepCollections.GAME_HOLES, {
    moduleId: 'minigolf',
    queryKey: [...queryKeys.module('minigolf').all(), 'holes', gameId || ''],
    parent: gameId ? [AepCollections.GAMES, gameId] : undefined,
    enabled: !!gameId,
    sort: (a, b) => a.hole_number - b.hole_number,
  });
}
