import { describe, expect, it } from 'vitest';
import {
  MAX_CAPTION_CHARS,
  boundCaption,
  captionFromHtml,
  captionFromTiktokOembed,
  recipeLinksInCaption,
  socialPlatform,
  tiktokOembedUrl,
  unwrapInstagramCaption,
} from '../importers/socialPost';

describe('socialPlatform', () => {
  it.each([
    ['https://www.tiktok.com/@cook/video/123', 'tiktok'],
    ['https://vm.tiktok.com/ZMabc/', 'tiktok'],
    ['https://www.instagram.com/reel/Cabc/', 'instagram'],
    ['https://instagram.com/p/Cabc/', 'instagram'],
    ['https://youtube.com/shorts/abc', 'youtube'],
    ['https://youtu.be/abc', 'youtube'],
    ['https://m.youtube.com/watch?v=abc', 'youtube'],
  ])('%s is %s', (url, platform) => {
    expect(socialPlatform(url)).toBe(platform);
  });

  it('is null for other sites, including look-alike hosts', () => {
    expect(socialPlatform('https://www.seriouseats.com/fried-rice')).toBeNull();
    expect(socialPlatform('https://nottiktok.com/x')).toBeNull();
    expect(socialPlatform('https://tiktok.com.evil.example/x')).toBeNull();
    expect(socialPlatform('not a url')).toBeNull();
  });
});

describe('TikTok oEmbed', () => {
  it('builds the endpoint URL with the post URL encoded', () => {
    expect(tiktokOembedUrl('https://www.tiktok.com/@a/video/1?x=y')).toBe(
      'https://www.tiktok.com/oembed?url=https%3A%2F%2Fwww.tiktok.com%2F%40a%2Fvideo%2F1%3Fx%3Dy',
    );
  });

  it('reads the caption from `title`', () => {
    expect(captionFromTiktokOembed({ title: ' Fried rice 🍚\n2 cups rice ' })).toBe(
      'Fried rice 🍚\n2 cups rice',
    );
    expect(captionFromTiktokOembed({ title: '' })).toBeUndefined();
    expect(captionFromTiktokOembed({ author_name: 'x' })).toBeUndefined();
    expect(captionFromTiktokOembed(null)).toBeUndefined();
  });
});

describe('unwrapInstagramCaption', () => {
  it('drops the engagement counts and byline', () => {
    expect(
      unwrapInstagramCaption(
        '12K likes, 80 comments - cook on June 3, 2025: "Fried rice\n2 cups rice". ',
      ),
    ).toBe('Fried rice\n2 cups rice');
  });

  it('handles the og:title form and curly quotes', () => {
    expect(unwrapInstagramCaption('Cook on Instagram: “Fried rice”')).toBe('Fried rice');
  });

  it('leaves text without that wrapper alone', () => {
    expect(unwrapInstagramCaption('Just a caption')).toBe('Just a caption');
  });
});

const page = (meta: string, body = '') =>
  `<!doctype html><html><head>${meta}</head><body>${body}</body></html>`;

describe('captionFromHtml', () => {
  it('reads og:description, decoding entities', () => {
    const html = page('<meta property="og:description" content="Rice &amp; eggs">');
    expect(captionFromHtml(html, 'tiktok')).toBe('Rice & eggs');
  });

  it('unwraps an Instagram caption', () => {
    const html = page(
      `<meta property="og:description" content="5 likes, 1 comments - cook on May 1, 2025: &quot;2 cups rice&quot;">`,
    );
    expect(captionFromHtml(html, 'instagram')).toBe('2 cups rice');
  });

  it("prefers YouTube's full description over the truncated meta tag", () => {
    const html = page(
      '<meta property="og:description" content="Fried rice in 10 min…">',
      '<script>var ytInitialPlayerResponse = {"videoDetails":{"shortDescription":"Fried rice\\n\\nIngredients:\\n2 cups \\"day-old\\" rice"}};</script>',
    );
    expect(captionFromHtml(html, 'youtube')).toBe('Fried rice\n\nIngredients:\n2 cups "day-old" rice');
  });

  it('is undefined when the page carries no caption (a login wall)', () => {
    expect(captionFromHtml(page('<title>Login • Instagram</title>'), 'instagram')).toBeUndefined();
  });
});

describe('recipeLinksInCaption', () => {
  it('finds recipe links, trimming trailing punctuation', () => {
    expect(
      recipeLinksInCaption('Full recipe: https://cook.example/fried-rice. Enjoy!'),
    ).toEqual(['https://cook.example/fried-rice']);
  });

  it('skips the platforms themselves and link-in-bio hubs', () => {
    expect(
      recipeLinksInCaption(
        'Follow https://www.instagram.com/cook and https://linktr.ee/cook — https://cook.example/r',
      ),
    ).toEqual(['https://cook.example/r']);
  });

  it('dedupes and caps the number of links', () => {
    const links = recipeLinksInCaption(
      'https://a.example/1 https://a.example/1 https://b.example/2 https://c.example/3',
    );
    expect(links).toEqual(['https://a.example/1', 'https://b.example/2']);
  });

  it('is empty for a caption with no links', () => {
    expect(recipeLinksInCaption('Recipe in bio 👆')).toEqual([]);
  });
});

describe('boundCaption', () => {
  it('cuts an overlong caption', () => {
    expect(boundCaption('x'.repeat(MAX_CAPTION_CHARS + 50))).toHaveLength(MAX_CAPTION_CHARS);
    expect(boundCaption('short')).toBe('short');
  });
});
