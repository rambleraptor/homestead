/**
 * Recipes "import from a social post" format (TikTok, Instagram, YouTube).
 *
 * Server-only (under `methods/`, so the client build stubs it out). One post
 * URL per line; for each:
 *
 *  1. Read the post's caption — TikTok's oEmbed, else the page's `og:` tags
 *     (YouTube's full description from its player data). Every fetch goes
 *     through the SSRF fence in `safeFetch`.
 *  2. If the caption links a recipe page ("full recipe on my blog"), import
 *     that page with the regular URL importer: a real recipe page beats a model
 *     reading a caption.
 *  3. Otherwise have the AI transcribe the recipe from the caption.
 *
 * A URL that isn't one of the platforms goes straight to the URL importer, so
 * a mixed paste still works. The recipe in the video itself (spoken, or shown
 * on screen) isn't read — the screenshots format covers that.
 */

import type {
  BulkImportParser,
  ParsedItem,
} from '@rambleraptor/homestead-core/resources/bulk-import/types';
import {
  UnsafeUrlError,
  parseHttpUrl,
  safeFetch,
  safeFetchHtml,
} from '@rambleraptor/homestead-core/server/net/safe-fetch';
import {
  boundCaption,
  captionFromHtml,
  captionFromTiktokOembed,
  platformName,
  recipeLinksInCaption,
  socialPlatform,
  tiktokOembedUrl,
  type SocialPlatform,
} from '../importers/socialPost';
import type { RecipeImportResult } from '../importers/types';
import { extractRecipeFromCaption } from './ai-recipe-extract';
import { importRecipeFromUrl, splitUrls } from './bulk-import-url';
import { toParsedItems } from './recipe-import-adapter';

/** Each post can mean a model call, so the batch is smaller than the URL format's. */
export const MAX_POSTS = 10;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** TikTok's oEmbed caption, or undefined if the endpoint had none for this URL. */
async function tiktokCaption(postUrl: string): Promise<string | undefined> {
  try {
    const { bytes } = await safeFetch(tiktokOembedUrl(postUrl), {
      accept: ['application/json'],
      maxBytes: 256 * 1024,
    });
    return captionFromTiktokOembed(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    // Fall through to the page itself — a short link (vm.tiktok.com) is often
    // only resolvable by following its redirect.
    return undefined;
  }
}

/** The post's caption and its address after redirects. */
async function fetchCaption(
  url: URL,
  platform: SocialPlatform,
): Promise<{ caption?: string; postUrl: string }> {
  const given = url.toString();
  if (platform === 'tiktok') {
    const caption = await tiktokCaption(given);
    if (caption) return { caption, postUrl: given };
  }

  // YouTube watch pages run past the default 2 MB with their inline player data.
  const { html, url: finalUrl } = await safeFetchHtml(given, { maxBytes: 5 * 1024 * 1024 });

  if (platform === 'tiktok' && finalUrl !== given) {
    const caption = await tiktokCaption(finalUrl);
    if (caption) return { caption, postUrl: finalUrl };
  }
  return { caption: captionFromHtml(html, platform), postUrl: finalUrl };
}

export async function importSocialPost(input: string): Promise<RecipeImportResult> {
  let url: URL;
  try {
    url = parseHttpUrl(input);
  } catch (error) {
    return { warnings: [], errors: [message(error)] };
  }

  const platform = socialPlatform(url);
  if (!platform) return importRecipeFromUrl(input);
  const name = platformName(platform);

  let caption: string | undefined;
  let postUrl: string;
  try {
    ({ caption, postUrl } = await fetchCaption(url, platform));
  } catch (error) {
    return {
      warnings: [],
      errors: [
        error instanceof UnsafeUrlError
          ? `Could not read the ${name} post: ${error.message}`
          : `Could not read the ${name} post: ${message(error)}`,
      ],
    };
  }

  if (!caption) {
    return {
      warnings: [],
      errors: [
        `${name} didn't share this post's caption (it may need a login). Take screenshots of the recipe and use the Screenshots import instead.`,
      ],
    };
  }

  for (const link of recipeLinksInCaption(caption)) {
    const linked = await importRecipeFromUrl(link);
    if (linked.data) {
      return {
        ...linked,
        warnings: [`Imported from the recipe page linked in the ${name} post.`, ...linked.warnings],
      };
    }
  }

  try {
    return await extractRecipeFromCaption({
      caption: boundCaption(caption),
      sourceUrl: postUrl,
      platform: name,
    });
  } catch (error) {
    return {
      warnings: [],
      errors: [`AI couldn't read the recipe from the ${name} post: ${message(error)}`],
    };
  }
}

const parser: BulkImportParser = {
  async parse(input): Promise<ParsedItem[]> {
    const urls = splitUrls(input.text ?? '');

    if (urls.length === 0) {
      return toParsedItems([
        { warnings: [], errors: ['Paste at least one post link to import.'] },
      ]);
    }
    if (urls.length > MAX_POSTS) {
      return toParsedItems([
        {
          warnings: [],
          errors: [`${urls.length} links pasted, but at most ${MAX_POSTS} can be imported at once.`],
        },
      ]);
    }

    // Sequential, like the URL format: other people's servers, and one model
    // call at a time.
    const results: RecipeImportResult[] = [];
    for (const url of urls) {
      results.push(await importSocialPost(url));
    }
    return toParsedItems(results, urls.length > 1 ? urls : undefined);
  },

  columns: [
    {
      name: 'Post link',
      required: true,
      description:
        'A TikTok, Instagram, or YouTube link, one per line. The recipe must be written in the caption or linked from it.',
    },
  ],
};

export default parser;
