import type { ModuleRouteProps } from '@/modules/types';
import { RecipeView } from './RecipeView';

export function RecipeViewRoute({ params }: ModuleRouteProps) {
  return <RecipeView recipeId={params?.id ?? ''} />;
}
