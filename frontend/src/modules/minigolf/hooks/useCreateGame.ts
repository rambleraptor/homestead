/**
 * Create Game Mutation Hook
 *
 * `created_by` is the aepbase resource path `users/{id}`. `played_at`
 * defaults to now if not provided.
 */

import { AepCollections } from '@/core/api/aepbase';
import { currentUserPath, useAepCreate } from '@/core/api/resourceHooks';
import type { Game, GameFormData } from '../types';

export function useCreateGame() {
  return useAepCreate<Game, GameFormData>(AepCollections.GAMES, {
    moduleId: 'minigolf',
    transform: (data) => ({
      location: data.location,
      played_at: data.played_at || new Date().toISOString(),
      players: data.players,
      hole_count: data.hole_count,
      completed: false,
      created_by: currentUserPath(),
    }),
  });
}
