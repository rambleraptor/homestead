/**
 * Delete Game Mutation Hook. Cascade-deletes child holes.
 */

import { AepCollections } from '@/core/api/aepbase';
import { useAepRemove } from '@/core/api/resourceHooks';

export function useDeleteGame() {
  return useAepRemove(AepCollections.GAMES, { moduleId: 'minigolf' });
}
