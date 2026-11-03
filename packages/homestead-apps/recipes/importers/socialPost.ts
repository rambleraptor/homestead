/**
 * Reading a recipe's text out of a social video post (TikTok, Instagram,
 * YouTube).
 *
 * These platforms publish no structured recipe data, so the recipe — when it is
 * written down at all — is in the post's caption. This module finds that
 * caption in what the platform *does* publish (oEmbed JSON, `og:` meta tags,
 * YouTube's embedded player data) and pulls recipe links out of it.
 *
 * Like `urlImporter`, it does no network I/O: the caller
 * (`../methods/bulk-import-social`) fetches through the SSRF fence and hands
 * the bodies here, which keeps this pure and its tests offline.
 */

import { load } from 'cheerio';

export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube';

const PLATFORM_HOSTS: Record<SocialPlatform, string[]> = {
  tiktok: ['tiktok.com'],
  instagram: ['instagram.com', 'instagr.am'],
  youtube: ['youtube.com', 'youtu.be'],
};

/**
 * Link-in-bio pages: a caption saying "recipe at the link in bio" often links
 * one, but it's a list of links rather than a recipe, so it isn't worth a fetch.
 */
const LINK_HUB_HOSTS = ['linktr.ee', 'beacons.ai', 'linkin.bio', 'stan.store', 'lnk.bio'];

/** Recipe-page links followed per post, so a caption full of links stays cheap. */
export const MAX_CAPTION_LINKS = 2;

/**
 * The model sees at most this much caption. Real recipe captions are a few
 * thousand characters; YouTube descriptions can run far longer with sponsor
 * blurbs and chapter lists that carry no recipe.
 */
export const MAX_CAPTION_CHARS = 8000;

function hostMatches(hostname: string, domains: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Which platform a URL belongs to, or null for any other site. */
export function socialPlatform(url: string | URL): SocialPlatform | null {
  let parsed: URL;
  try {
    parsed = typeof url === 'string' ? new URL(url) : url;
  } catch {
    return null;
  }
  for (const [platform, hosts] of Object.entries(PLATFORM_HOSTS) as Array<
    [SocialPlatform, string[]]
  >) {
    if (hostMatches(parsed.hostname, hosts)) return platform;
  }
  return null;
}

/** Display name for messages. */
export function platformName(platform: SocialPlatform): string {
  return { tiktok: 'TikTok', instagram: 'Instagram', youtube: 'YouTube' }[platform];
}

/** TikTok's public oEmbed endpoint for a post — it carries the caption as `title`. */
export function tiktokOembedUrl(postUrl: string): string {
  return `https://www.tiktok.com/oembed?url=${encodeURIComponent(postUrl)}`;
}

/** The caption from a TikTok oEmbed response body, if it has one. */
export function captionFromTiktokOembed(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const title = (json as { title?: unknown }).title;
  return typeof title === 'string' ? clean(title) : undefined;
}

/**
 * Instagram's `og:description` wraps the caption in engagement counts and a
 * byline — `12K likes, 80 comments - cook on June 3, 2025: "Caption…"` — and
 * its `og:title` in `Name on Instagram: "Caption…"`. Keep only the quoted part.
 */
export function unwrapInstagramCaption(text: string): string {
  const match = text.match(/^[^"“]*?:\s*["“]([\s\S]*?)["”]?\.?\s*$/);
  return (match ? match[1] : text).trim();
}

/**
 * YouTube embeds the full description as `"shortDescription":"…"` (a JSON
 * string) in its player data; the `og:description` is cut at ~160 characters.
 */
function youtubeDescription(html: string): string | undefined {
  const match = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (!match) return undefined;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return undefined;
  }
}

/** Trim, and drop control characters a caption can carry but a prompt shouldn't. */
function clean(text: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * The post's caption from its page HTML, using the most complete source the
 * platform offers. Undefined when the page carries none — typically a login
 * wall served instead of the post.
 */
export function captionFromHtml(html: string, platform: SocialPlatform): string | undefined {
  if (platform === 'youtube') {
    const full = youtubeDescription(html);
    if (full && clean(full)) return clean(full);
  }

  const $ = load(html);
  const meta = (key: string) =>
    $(`meta[property="${key}"]`).attr('content') ?? $(`meta[name="${key}"]`).attr('content');

  const candidates = [meta('og:description'), meta('description'), meta('og:title')];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const text = platform === 'instagram' ? unwrapInstagramCaption(candidate) : candidate;
    const cleaned = clean(text);
    if (cleaned) return cleaned;
  }
  return undefined;
}

/** The post's preview title, for labelling a result. */
export function titleFromHtml(html: string): string | undefined {
  const $ = load(html);
  return clean($('meta[property="og:title"]').attr('content') ?? $('title').text() ?? '');
}

/**
 * Links in a caption worth trying as a recipe page: not the platforms
 * themselves, not link-in-bio hubs, deduped, in caption order.
 */
export function recipeLinksInCaption(caption: string): string[] {
  const found = caption.match(/https?:\/\/[^\s<>"'“”)\]]+/gi) ?? [];
  const out: string[] = [];
  for (const raw of found) {
    const candidate = raw.replace(/[.,!?;:]+$/, '');
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (socialPlatform(url) || hostMatches(url.hostname, LINK_HUB_HOSTS)) continue;
    const key = url.toString();
    if (!out.includes(key)) out.push(key);
    if (out.length === MAX_CAPTION_LINKS) break;
  }
  return out;
}

/** Bound the caption the model sees. */
export function boundCaption(caption: string): string {
  return caption.length > MAX_CAPTION_CHARS ? caption.slice(0, MAX_CAPTION_CHARS) : caption;
}
