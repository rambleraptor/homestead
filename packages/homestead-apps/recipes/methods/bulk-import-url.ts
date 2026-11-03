/**
 * Recipes "import from a URL" format.
 *
 * Server-only (under `methods/`, so the client build stubs it out) — which is
 * what makes this safe to build on: the fetch happens on the server, where the
 * SSRF fence in `safeFetchHtml` applies, rather than in a browser that could be
 * pointed anywhere.
 *
 * Declared as a `text` format because the framework's textarea is exactly the
 * right input: one URL per line imports a batch, and each URL becomes its own
 * selectable row in the preview. The extraction itself lives in
 * `../importers/urlImporter`, which never touches the network.
 */

import type {
  BulkImportParser,
  ParsedItem,
} from '@rambleraptor/homestead-core/resources/bulk-import/types';
import {
  UnsafeUrlError,
  safeFetchHtml,
} from '@rambleraptor/homestead-core/server/net/safe-fetch';
import { importRecipeFromHtml } from '../importers/urlImporter';
import type { RecipeImportResult } from '../importers/types';
import { toParsedItems } from './recipe-import-adapter';

/**
 * Bound on one import. Each URL is a network round-trip, so a pasted list is
 * rate-limited by nature — but a 500-line paste shouldn't tie up an operation
 * for an hour either.
 */
export const MAX_URLS = 20;

/**
 * Fetched sequentially rather than in parallel: these are other people's
 * servers, and a household import has no deadline worth hammering them for.
 */
export async function importRecipeFromUrl(url: string): Promise<RecipeImportResult> {
  try {
    const { html, url: finalUrl } = await safeFetchHtml(url);
    return await importRecipeFromHtml(html, finalUrl);
  } catch (error) {
    // An unreachable or refused URL is one failed row, not a failed import —
    // its siblings in the paste still get their chance.
    const message =
      error instanceof UnsafeUrlError
        ? error.message
        : `Could not import ${url}: ${
            error instanceof Error ? error.message : String(error)
          }`;
    return { warnings: [], errors: [message] };
  }
}

/** Split the textarea into URLs, ignoring blank lines and `#` comments. */
export function splitUrls(text: string): string[] {
  return text
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

const parser: BulkImportParser = {
  async parse(input): Promise<ParsedItem[]> {
    const urls = splitUrls(input.text ?? '');

    if (urls.length === 0) {
      return toParsedItems([
        { warnings: [], errors: ['Paste at least one recipe URL to import.'] },
      ]);
    }
    if (urls.length > MAX_URLS) {
      return toParsedItems([
        {
          warnings: [],
          errors: [
            `${urls.length} URLs pasted, but at most ${MAX_URLS} can be imported at once.`,
          ],
        },
      ]);
    }

    const results: RecipeImportResult[] = [];
    for (const url of urls) {
      results.push(await importRecipeFromUrl(url));
    }

    // Label rows by URL when several were pasted, so a failed row says which.
    return toParsedItems(results, urls.length > 1 ? urls : undefined);
  },

  columns: [
    {
      name: 'URL',
      required: true,
      description:
        'A recipe page URL, one per line. Blank lines and lines starting with # are ignored.',
    },
  ],
};

export default parser;
