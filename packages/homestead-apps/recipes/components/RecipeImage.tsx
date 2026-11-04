/**
 * Renders a recipe's photo. Returns null while the aepbase blob is loading,
 * on download failure, or when the recipe has no image.
 */

import type { CSSProperties } from 'react';
import type { Recipe } from '../types';
import { useRecipeImageUrl } from '../hooks/useRecipeImageUrl';

interface RecipeImageProps {
  recipe: Recipe;
  alt: string;
  className?: string;
  /** Inline style — carries the view-transition name that pairs a list card's photo with the detail hero. */
  style?: CSSProperties;
}

export function RecipeImage({ recipe, alt, className, style }: RecipeImageProps) {
  const url = useRecipeImageUrl(recipe);
  if (!url) return null;
  return <img src={url} alt={alt} className={className} style={style} />;
}
