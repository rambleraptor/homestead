import { AepCollections } from '@/core/api/aepbase';
import { useAepRemove } from '@/core/api/resourceHooks';

export function useDeleteRecipe() {
  return useAepRemove(AepCollections.RECIPES, { moduleId: 'recipes' });
}
