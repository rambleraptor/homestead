/**
 * Recipe importer registry.
 *
 * New formats plug in by implementing `RecipeImporter` (see `./types.ts`)
 * and appending themselves to `RECIPE_IMPORTERS` below. The UI consumes
 * this list directly, so no other wiring is needed.
 */

import { paprikaImporter } from './paprikaImporter';
import { textImporter } from './textImporter';
import type { RecipeImporter } from './types';

export const RECIPE_IMPORTERS: RecipeImporter[] = [textImporter, paprikaImporter];

export const DEFAULT_IMPORTER_ID = textImporter.id;

export function getImporter(id: string): RecipeImporter | undefined {
  return RECIPE_IMPORTERS.find((imp) => imp.id === id);
}

export type { RecipeImporter, RecipeImportResult } from './types';
