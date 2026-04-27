/**
 * Create Hole Mutation Hook
 *
 * Records one hole's score for a game. Parent id is part of the URL.
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import { currentUserPath, useAepCreate } from '@/core/api/resourceHooks';
import type { Hole, HoleFormData } from '../types';

interface CreateHoleParams {
  gameId: string;
  data: HoleFormData;
}

export function useCreateHole() {
  return useAepCreate<Hole, CreateHoleParams>(AepCollections.GAME_HOLES, {
    moduleId: 'minigolf',
    // parent id is per-call (lives on `vars`), so use a custom mutationFn.
    mutationFn: async ({ gameId, data }) =>
      aepbase.create<Hole>(
        AepCollections.GAME_HOLES,
        { ...data, created_by: currentUserPath() },
        { parent: [AepCollections.GAMES, gameId] },
      ),
  });
}
