/**
 * Append a new hand to localStorage. Generates the id + timestamps
 * here so callers only need to supply the per-direction bids + notes.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import { loadHands, newHandId, saveHands } from '../storage';
import type { Hand, HandFormData } from '../types';

export function useCreateHand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: HandFormData): Promise<Hand> => {
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('bridge').all(),
      });
    },
    onError: (error) => {
      logger.error('Failed to save bridge hand', error);
    },
  });
}
