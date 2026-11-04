/**
 * A collection's cover: a 2×2 mosaic of four of its recipes' photos. A recipe
 * without a photo gets a tinted tile with its initial, and an empty cookbook a
 * single book tile — so a cover is never blank and never needs an upload.
 */

import { BookOpen } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { membersOf } from '../../utils/cookbooks';
import type { Cookbook, Recipe } from '../../types';
import { RecipeImage } from '../RecipeImage';

interface CookbookCoverProps {
  cookbook: Cookbook;
  /** Every recipe, so member ids can be resolved; missing ids are skipped. */
  recipes: Recipe[] | undefined;
  className?: string;
}

/** Warm, muted tiles; chosen by title so a recipe keeps its colour everywhere. */
const TILE_COLORS = ['#D9C7B3', '#C96E55', '#7A8F6B', '#E8C98A', '#5E7F9A', '#9B6B4F', '#B5566A', '#C4793F'];

function tileColor(title: string): string {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

/** Up to four member recipes that still exist, newest first like the library. */
export function coverRecipes(cookbook: Cookbook, recipes: Recipe[] | undefined): Recipe[] {
  return membersOf(cookbook, recipes).slice(0, 4);
}

export function CookbookCover({ cookbook, recipes, className }: CookbookCoverProps) {
  const tiles = coverRecipes(cookbook, recipes);

  if (tiles.length === 0) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center rounded-lg bg-bg-pearl text-text-muted',
          className,
        )}
      >
        <BookOpen className="h-1/3 w-1/3" />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={cn('grid grid-cols-2 gap-0.5 overflow-hidden rounded-lg bg-gray-200', className)}
    >
      {tiles.map((recipe) => (
        <div
          key={recipe.id}
          className="relative flex min-h-0 items-center justify-center overflow-hidden"
          style={{ backgroundColor: tileColor(recipe.title) }}
        >
          <span className="font-display text-lg font-semibold text-white/80">
            {recipe.title.slice(0, 1).toUpperCase()}
          </span>
          {recipe.image && (
            <RecipeImage
              recipe={recipe}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </div>
      ))}
      {Array.from({ length: 4 - tiles.length }, (_, i) => (
        <div key={`pad-${i}`} className="bg-bg-pearl" />
      ))}
    </div>
  );
}
