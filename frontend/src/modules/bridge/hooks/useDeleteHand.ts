/**
 * Remove a hand from localStorage by id.
 */

import { useAepRemove } from '@/core/api/resourceHooks';
import { loadHands, saveHands } from '../storage';

export function useDeleteHand() {
  return useAepRemove<string>('hands', {
    moduleId: 'bridge',
    mutationFn: async (id) => {
      saveHands(loadHands().filter((hand) => hand.id !== id));
    },
  });
}
