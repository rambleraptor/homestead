import { RecipeView } from '@rambleraptor/homestead-modules/recipes/components/RecipeView';

export default async function RecipeViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RecipeView recipeId={id} />;
}
