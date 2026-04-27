/**
 * Update Game Mutation Hook — used to flag a game `completed` or edit notes.
 */

import { AepCollections } from '@/core/api/aepbase';
import { useAepUpdate } from '@/core/api/resourceHooks';
import type { Game } from '../types';

interface UpdateGameParams {
  id: string;
  data: Partial<
    Pick<Game, 'location' | 'notes' | 'completed' | 'played_at' | 'hole_count'>
  >;
}

export function useUpdateGame() {
  return useAepUpdate<Game, UpdateGameParams>(AepCollections.GAMES, {
    moduleId: 'minigolf',
  });
}
