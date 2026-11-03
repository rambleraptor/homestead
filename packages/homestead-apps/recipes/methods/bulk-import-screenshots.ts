/**
 * Recipes "import from screenshots" format.
 *
 * Server-only (under `methods/`, so the client build stubs it out). The
 * fallback for every recipe the social-post format can't reach: a caption
 * behind a login wall, a recipe only shown on screen in a video, a page in a
 * cookbook. All the uploaded images go to the model in one call, so a recipe
 * that spans three screenshots comes back as one recipe — and screenshots of
 * different recipes come back as several.
 */

import type {
  BulkImportFile,
  BulkImportParser,
  ParsedItem,
} from '@rambleraptor/homestead-core/resources/bulk-import/types';
import { extractRecipesFromImages, type ExtractionImage } from './ai-recipe-extract';
import { toParsedItems } from './recipe-import-adapter';

export const MAX_SCREENSHOTS = 10;

/** Per image; the framework caps the whole upload at 25 MB. */
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

/**
 * The image's media type from its first bytes. The framework doesn't carry
 * the browser's MIME type, and a file name is only a hint; the model provider
 * needs the real type, and only these are accepted across providers.
 */
export function sniffImageType(bytes: Uint8Array): string | undefined {
  const starts = (sig: number[], offset = 0) =>
    bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  return undefined;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Check one upload; a string is the reason it can't be used. */
function prepare(file: BulkImportFile): ExtractionImage | string {
  const mediaType = sniffImageType(file.bytes);
  if (!mediaType) {
    return `${file.name} isn't a PNG, JPEG, WebP, or GIF image.`;
  }
  if (file.bytes.length > MAX_SCREENSHOT_BYTES) {
    return `${file.name} is larger than ${MAX_SCREENSHOT_BYTES / (1024 * 1024)} MB.`;
  }
  return { base64: toBase64(file.bytes), mediaType };
}

const parser: BulkImportParser = {
  async parse(input): Promise<ParsedItem[]> {
    const files = input.files ?? [];
    if (files.length === 0) {
      return toParsedItems([{ warnings: [], errors: ['Choose at least one screenshot.'] }]);
    }
    if (files.length > MAX_SCREENSHOTS) {
      return toParsedItems([
        {
          warnings: [],
          errors: [`${files.length} images chosen, but at most ${MAX_SCREENSHOTS} can be read at once.`],
        },
      ]);
    }

    const images: ExtractionImage[] = [];
    const problems: string[] = [];
    for (const file of files) {
      const prepared = prepare(file);
      if (typeof prepared === 'string') problems.push(prepared);
      else images.push(prepared);
    }
    // All or nothing: the images are read together as one source, so a
    // skipped image could silently drop half a recipe.
    if (problems.length > 0) {
      return toParsedItems([{ warnings: [], errors: problems }]);
    }

    try {
      return toParsedItems([await extractRecipesFromImages(images)]);
    } catch (error) {
      return toParsedItems([
        {
          warnings: [],
          errors: [
            `AI couldn't read the screenshots: ${error instanceof Error ? error.message : String(error)}`,
          ],
        },
      ]);
    }
  },
};

export default parser;
