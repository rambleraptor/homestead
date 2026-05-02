/**
 * Recipe Importer Types
 *
 * A recipe importer converts user-supplied input in a particular format into
 * one or more `RecipeFormData`s suitable for `useCreateRecipe`. New formats
 * (JSON-LD, schema.org markup, URL fetch, CSV, Paprika, etc.) plug in by
 * implementing either the text or file variant below and registering
 * themselves in `./index.ts`.
 */

import type { RecipeFormData } from '../types';

export interface RecipeImportResult {
  /** Parsed recipe, ready to submit. Undefined when parsing failed. */
  data?: RecipeFormData;
  /**
   * Additional recipes parsed from the same input (e.g. a multi-recipe
   * Paprika archive). The UI imports `data` first, then each of these.
   */
  additional?: RecipeFormData[];
  /** Non-fatal warnings surfaced to the user in the preview. */
  warnings: string[];
  /** Fatal errors; when non-empty, `data` should be undefined. */
  errors: string[];
}

interface BaseImporter {
  /** Stable identifier used in UI state and tests. */
  id: string;
  /** Human-readable label shown in the format picker. */
  label: string;
  /** Optional help text shown above the input box. */
  description?: string;
}

export interface TextRecipeImporter extends BaseImporter {
  inputType: 'text';
  /** Placeholder shown in the input textarea. */
  placeholder?: string;
  /** Convert pasted text into a recipe. Pure / synchronous. */
  parse(input: string): RecipeImportResult;
}

export interface FileRecipeImporter extends BaseImporter {
  inputType: 'file';
  /** `accept` attribute for the `<input type="file">`, e.g. ".paprikarecipe". */
  accept: string;
  /** Convert an uploaded file into one or more recipes. */
  parseFile(file: File): Promise<RecipeImportResult>;
}

export type RecipeImporter = TextRecipeImporter | FileRecipeImporter;
