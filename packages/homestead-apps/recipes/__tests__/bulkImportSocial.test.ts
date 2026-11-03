import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@rambleraptor/homestead-core/server/net/safe-fetch', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@rambleraptor/homestead-core/server/net/safe-fetch')>();
  return { ...actual, safeFetch: vi.fn(), safeFetchHtml: vi.fn() };
});
vi.mock('../methods/ai-recipe-extract', () => ({ extractRecipeFromCaption: vi.fn() }));
vi.mock('../methods/bulk-import-url', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../methods/bulk-import-url')>();
  return { ...actual, importRecipeFromUrl: vi.fn() };
});

import {
  safeFetch,
  safeFetchHtml,
} from '@rambleraptor/homestead-core/server/net/safe-fetch';
import { extractRecipeFromCaption } from '../methods/ai-recipe-extract';
import { importRecipeFromUrl } from '../methods/bulk-import-url';
import parser, { MAX_POSTS, importSocialPost } from '../methods/bulk-import-social';

const fetchJson = vi.mocked(safeFetch);
const fetchHtml = vi.mocked(safeFetchHtml);
const extract = vi.mocked(extractRecipeFromCaption);
const importUrl = vi.mocked(importRecipeFromUrl);

const ctx = { auth: { token: 't', user: { path: 'users/1' } }, plural: 'recipes' } as never;

function oembed(title: string) {
  return {
    url: 'https://www.tiktok.com/oembed',
    status: 200,
    contentType: 'application/json',
    bytes: new TextEncoder().encode(JSON.stringify({ title })),
  };
}

const recipe = { title: 'Fried Rice', parsed_ingredients: [] };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('importSocialPost', () => {
  it('reads a TikTok caption from oEmbed and has the AI transcribe it', async () => {
    fetchJson.mockResolvedValue(oembed('Fried rice\n2 cups rice'));
    extract.mockResolvedValue({ data: recipe, warnings: [], errors: [] });

    const result = await importSocialPost('https://www.tiktok.com/@cook/video/1');

    expect(result.data).toEqual(recipe);
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(extract).toHaveBeenCalledWith({
      caption: 'Fried rice\n2 cups rice',
      sourceUrl: 'https://www.tiktok.com/@cook/video/1',
      platform: 'TikTok',
    });
  });

  it('follows a short link when oEmbed has nothing, then retries oEmbed', async () => {
    fetchJson
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce(oembed('From the full URL'));
    fetchHtml.mockResolvedValue({
      url: 'https://www.tiktok.com/@cook/video/9',
      html: '<html></html>',
    });
    extract.mockResolvedValue({ data: recipe, warnings: [], errors: [] });

    await importSocialPost('https://vm.tiktok.com/ZMabc/');

    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: 'From the full URL',
        sourceUrl: 'https://www.tiktok.com/@cook/video/9',
      }),
    );
  });

  it('imports the recipe page a caption links instead of asking the AI', async () => {
    fetchHtml.mockResolvedValue({
      url: 'https://www.instagram.com/reel/abc/',
      html: '<meta property="og:description" content="1 likes, 0 comments - cook on May 1, 2025: &quot;Recipe: https://cook.example/rice&quot;">',
    });
    importUrl.mockResolvedValue({ data: recipe, warnings: [], errors: [] });

    const result = await importSocialPost('https://www.instagram.com/reel/abc/');

    expect(importUrl).toHaveBeenCalledWith('https://cook.example/rice');
    expect(extract).not.toHaveBeenCalled();
    expect(result.data).toEqual(recipe);
    expect(result.warnings[0]).toMatch(/linked in the Instagram post/);
  });

  it('falls back to the AI when the linked page has no recipe', async () => {
    fetchHtml.mockResolvedValue({
      url: 'https://www.instagram.com/reel/abc/',
      html: '<meta property="og:description" content="My shop https://shop.example 2 cups rice">',
    });
    importUrl.mockResolvedValue({ warnings: [], errors: ['No recipe found'] });
    extract.mockResolvedValue({ data: recipe, warnings: [], errors: [] });

    const result = await importSocialPost('https://www.instagram.com/reel/abc/');

    expect(extract).toHaveBeenCalled();
    expect(result.data).toEqual(recipe);
  });

  it('suggests screenshots when the platform hides the caption', async () => {
    fetchHtml.mockResolvedValue({
      url: 'https://www.instagram.com/accounts/login/',
      html: '<title>Login</title>',
    });

    const result = await importSocialPost('https://www.instagram.com/reel/abc/');

    expect(result.data).toBeUndefined();
    expect(result.errors[0]).toMatch(/Screenshots import/);
    expect(extract).not.toHaveBeenCalled();
  });

  it('hands a non-social link to the regular URL importer', async () => {
    importUrl.mockResolvedValue({ data: recipe, warnings: [], errors: [] });

    await importSocialPost('https://cook.example/rice');

    expect(importUrl).toHaveBeenCalledWith('https://cook.example/rice');
    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it('reports an AI failure as a row error rather than throwing', async () => {
    fetchJson.mockResolvedValue(oembed('2 cups rice'));
    extract.mockRejectedValue(new Error('quota exceeded'));

    const result = await importSocialPost('https://www.tiktok.com/@cook/video/1');

    expect(result.errors[0]).toMatch(/quota exceeded/);
  });

  it('rejects a non-http URL before fetching', async () => {
    const result = await importSocialPost('ftp://www.tiktok.com/x');
    expect(result.errors[0]).toMatch(/http/i);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});

describe('bulk-import-social parser', () => {
  it('asks for a link on empty input', async () => {
    const items = await parser.parse({ text: '  ' }, ctx);
    expect(items[0].errors[0]).toMatch(/paste at least one/i);
  });

  it('caps the batch', async () => {
    const text = Array.from({ length: MAX_POSTS + 1 }, (_, i) => `https://youtu.be/${i}`).join('\n');
    const items = await parser.parse({ text }, ctx);
    expect(items).toHaveLength(1);
    expect(items[0].errors[0]).toMatch(new RegExp(`at most ${MAX_POSTS}`));
  });
});
