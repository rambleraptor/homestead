/**
 * Append a new hand to localStorage. Generates the id + timestamps
 * here so callers only need to supply the per-direction bids + notes.
 */

import { useAepCreate } from '@/core/api/resourceHooks';
import { loadHands, newHandId, saveHands } from '../storage';
import type { Hand, HandFormData } from '../types';

export function useCreateHand() {
  return useAepCreate<Hand, HandFormData>('hands', {
    moduleId: 'bridge',
    mutationFn: async (data) => {
      const now = new Date().toISOString();
      const hand: Hand = {
        id: newHandId(),
        path: '',
        played_at: data.played_at || now,
        north_level: data.north_level,
        north_suit: data.north_suit,
        south_level: data.south_level,
        south_suit: data.south_suit,
        east_level: data.east_level,
        east_suit: data.east_suit,
        west_level: data.west_level,
        west_suit: data.west_suit,
        notes: data.notes,
        create_time: now,
        update_time: now,
      };
      hand.path = `hands/${hand.id}`;
      saveHands([...loadHands(), hand]);
      return hand;
    },
  });
}
