/**
 * Paprika recipe importer.
 *
 * Accepts Paprika 3's two export formats:
 *   - `.paprikarecipe`  — a single gzipped JSON blob
 *   - `.paprikarecipes` — a zip archive containing many `.paprikarecipe`s
 *
 * Multi-recipe archives are imported in bulk: the first recipe populates
 * `data`; the rest are returned in `additional` for the modal to submit
 * sequentially.
 *
 * Decompression uses the platform's `DecompressionStream` API, so there
 * is no runtime dependency on a zip/gzip library. Only the two zip
 * compression methods produced by Paprika (store/0 and deflate/8) are
 * supported — zip64, encryption, and multi-disk archives are not.
 */

import type { RecipeFormData, RecipeIngredient } from '../types';
import { parseIngredientLine, splitSteps } from './textImporter';
import type { FileRecipeImporter, RecipeImportResult } from './types';

const GZIP_MAGIC = [0x1f, 0x8b];
const ZIP_LFH_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const ZIP_EOCD_SIGNATURE = 0x06054b50;

function hasMagic(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

async function decompress(
  bytes: Uint8Array,
  format: 'gzip' | 'deflate-raw',
): Promise<Uint8Array> {
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream(format));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Minimal zip reader. Walks the central directory at the tail of the file,
 * then for each entry reads the local file header to locate the compressed
 * payload and decompresses it.
 */
async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // EOCD lives in the last 22..65557 bytes (fixed 22 + up to 65535 of comment).
  const minEocd = 22;
  let eocd = -1;
  const scanStart = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - minEocd; i >= scanStart; i--) {
    if (view.getUint32(i, true) === ZIP_EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) {
    throw new Error('Not a valid zip archive (end-of-central-directory not found)');
  }

  const totalEntries = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const lfhOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    const lfhNameLen = view.getUint16(lfhOffset + 26, true);
    const lfhExtraLen = view.getUint16(lfhOffset + 28, true);
    const dataStart = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
    const payload = bytes.subarray(dataStart, dataStart + compSize);

    let data: Uint8Array;
    if (method === 0) {
      data = payload;
    } else if (method === 8) {
      data = await decompress(payload, 'deflate-raw');
    } else {
      throw new Error(`Unsupported zip compression method: ${method}`);
    }
    entries.push({ name, data });
  }
  return entries;
}

export interface PaprikaRecipeJson {
  name?: string;
  source?: string;
  source_url?: string;
  description?: string;
  ingredients?: string;
  directions?: string;
  notes?: string;
  nutritional_info?: string;
  prep_time?: string;
  cook_time?: string;
  total_time?: string;
  servings?: string;
  difficulty?: string;
  categories?: string[];
  rating?: number;
}

function splitLines(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Paprika keeps "notes", "nutritional_info", "description", "total_time",
 * and "difficulty" around with no first-class schema field of our own, so
 * we roll them into the freeform method/Markdown blob. Prep time, cook
 * time, servings, and steps live on their own columns now.
 */
function buildMethod(json: PaprikaRecipeJson): string | undefined {
  const parts: string[] = [];

  const extras: string[] = [];
  if (json.total_time?.trim()) extras.push(`Total Time: ${json.total_time.trim()}`);
  if (json.difficulty?.trim()) extras.push(`Difficulty: ${json.difficulty.trim()}`);
  if (extras.length) parts.push(extras.join(' | '));

  if (json.description?.trim()) {
    parts.push(json.description.trim());
  }

  if (json.notes?.trim()) {
    parts.push(`## Notes\n\n${json.notes.trim()}`);
  }

  const nutritionLines = splitLines(json.nutritional_info);
  if (nutritionLines.length) {
    parts.push(`## Nutrition\n\n${nutritionLines.map((l) => `- ${l}`).join('\n')}`);
  }

  const method = parts.join('\n\n').trim();
  return method.length > 0 ? method : undefined;
}

export function paprikaJsonToRecipe(json: PaprikaRecipeJson): RecipeFormData {
  const title = json.name?.trim() || 'Untitled Recipe';
  const source_pointer = (json.source_url || json.source || '').trim() || undefined;

  const parsed_ingredients: RecipeIngredient[] = splitLines(json.ingredients).map(
    parseIngredientLine,
  );

  const steps = splitSteps(json.directions);

  const tags = (json.categories ?? [])
    .map((c) => c?.trim())
    .filter((c): c is string => Boolean(c && c.length > 0));

  return {
    title,
    source_pointer,
    parsed_ingredients,
    steps: steps.length > 0 ? steps : undefined,
    method: buildMethod(json),
    prep_time: json.prep_time?.trim() || undefined,
    cook_time: json.cook_time?.trim() || undefined,
    servings: json.servings?.trim() || undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

async function decodeRecipeBytes(bytes: Uint8Array): Promise<PaprikaRecipeJson> {
  // Paprika entries are always gzipped — but accept plain JSON as a fallback
  // in case an archive was re-packed by hand.
  const jsonBytes = hasMagic(bytes, GZIP_MAGIC)
    ? await decompress(bytes, 'gzip')
    : bytes;
  return JSON.parse(new TextDecoder().decode(jsonBytes));
}

async function parsePaprikaFile(file: File): Promise<RecipeImportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (err) {
    errors.push(
      `Failed to read file: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
    return { warnings, errors };
  }

  const recipes: RecipeFormData[] = [];

  try {
    if (hasMagic(bytes, GZIP_MAGIC)) {
      // Single .paprikarecipe.
      const json = await decodeRecipeBytes(bytes);
      recipes.push(paprikaJsonToRecipe(json));
    } else if (hasMagic(bytes, ZIP_LFH_MAGIC)) {
      // .paprikarecipes archive — may hold many recipes.
      const entries = await readZip(bytes);
      for (const entry of entries) {
        if (!entry.name.toLowerCase().endsWith('.paprikarecipe')) continue;
        try {
          const json = await decodeRecipeBytes(entry.data);
          recipes.push(paprikaJsonToRecipe(json));
        } catch (err) {
          warnings.push(
            `Skipped "${entry.name}": ${err instanceof Error ? err.message : 'parse error'}`,
          );
        }
      }
    } else {
      errors.push(
        'Unrecognized file format. Expected a Paprika .paprikarecipe or .paprikarecipes file.',
      );
      return { warnings, errors };
    }
  } catch (err) {
    errors.push(
      `Failed to decode Paprika file: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
    return { warnings, errors };
  }

  if (recipes.length === 0) {
    errors.push('No recipes found in the file.');
    return { warnings, errors };
  }

  const [first, ...rest] = recipes;
  return {
    data: first,
    additional: rest.length > 0 ? rest : undefined,
    warnings,
    errors,
  };
}

export const paprikaImporter: FileRecipeImporter = {
  id: 'paprika',
  label: 'Paprika',
  inputType: 'file',
  accept: '.paprikarecipe,.paprikarecipes',
  description:
    'Upload a Paprika 3 export (.paprikarecipe or .paprikarecipes). Multi-recipe archives are imported in bulk.',
  parseFile: parsePaprikaFile,
};
