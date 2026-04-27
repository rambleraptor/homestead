/**
 * Games list hook. aepbase has no sort param so we order client-side by
 * played_at (then create_time) desc — newest first.
 */

import { AepCollections } from '@/core/api/aepbase';
import { useAepList } from '@/core/api/resourceHooks';
import type { Game } from '../types';

export function useGames() {
  return useAepList<Game>(AepCollections.GAMES, {
    moduleId: 'minigolf',
    sort: (a, b) => {
      const aKey = a.played_at || a.create_time || '';
      const bKey = b.played_at || b.create_time || '';
      return bKey.localeCompare(aKey);
    },
  });
}
