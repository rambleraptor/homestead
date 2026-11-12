/**
 * Read a fetched page: what it's called, where it's from, and its main text
 * as Markdown for the reader.
 *
 * Pure — it takes HTML someone else fetched (`../syncs/capture`, through the
 * SSRF-guarded `safeFetch`) and does no I/O, which keeps it testable offline.
 *
 * Finding the main text is the usual readability approach, kept small: clear
 * out what is never content (scripts, navigation, comment sections, share
 * bars), prefer the page's own `<article>` / `<main>` when it has real text,
 * and otherwise score containers by the paragraphs they hold and take the best.
 */

import { load, type CheerioAPI } from 'cheerio';
import { kindFromUrl } from '../bookmarks';
import type { BookmarkKind } from '../types';
import { absoluteUrl, toMarkdown, type HtmlNode } from './toMarkdown';

export interface ExtractedPage {
  title?: string;
  site_name?: string;
  author?: string;
  excerpt?: string;
  image_url?: string;
  kind: BookmarkKind;
  /** The main text as Markdown; empty when the page has none to speak of. */
  content: string;
  word_count: number;
}

/** The longest text the reader keeps: a long book chapter, not a whole site. */
export const MAX_CONTENT_CHARS = 400_000;
const MAX_FIELD_CHARS = 300;
const MAX_EXCERPT_CHARS = 400;
/** Fewer words than this and a page reads as a landing page, not an article. */
const ARTICLE_WORDS = 120;
/** Below this, a container isn't worth calling the page's content. */
const MIN_CONTENT_CHARS = 200;
/** A block this long whose text is this much link text is a menu, not prose. */
const LINK_BLOCK_MIN_CHARS = 40;
const LINK_BLOCK_DENSITY = 0.6;

const NEVER_CONTENT =
  'script, style, noscript, template, iframe, object, embed, svg, canvas, form, button, ' +
  'input, select, textarea, nav, footer, aside, dialog, [hidden], [aria-hidden="true"], ' +
  '[role="navigation"], [role="banner"], [role="complementary"], [role="search"], [role="contentinfo"]';

/** Class / id fragments of the furniture around an article. */
const FURNITURE =
  /(^|[\s_-])(comments?|disqus|share|sharing|social|related|recommended|promo|advert|ads?|sponsor|sidebar|newsletter|subscribe|signup|cookie|consent|popup|modal|breadcrumbs?|pagination|pager|footer|masthead|menu|toolbar|byline-social|outbrain|taboola|toc|editsection|noprint|hatnote|navbox|sr-only|visually-hidden|screen-reader-text|skip-link)([\s_-]|$)/i;
/** …unless it also says it is the content. */
const CONTENT_HINT = /(article|content|post|entry|story|body|main)/i;

function clean(value: string | undefined | null, max = MAX_FIELD_CHARS): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function meta($: CheerioAPI, ...names: string[]): string | undefined {
  for (const name of names) {
    const value =
      $(`meta[property="${name}"]`).attr('content') ?? $(`meta[name="${name}"]`).attr('content');
    const text = clean(value, 2000);
    if (text) return text;
  }
  return undefined;
}

/** The author out of schema.org JSON-LD, when the page carries it. */
function jsonLdAuthor($: CheerioAPI): string | undefined {
  let found: string | undefined;
  const nameOf = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(nameOf).filter(Boolean).join(', ') || undefined;
    if (value && typeof value === 'object') return nameOf((value as { name?: unknown }).name);
    return undefined;
  };
  const visit = (value: unknown, depth: number): void => {
    if (found || depth > 4 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.author) found = nameOf(record.author);
    if (!found && record['@graph']) visit(record['@graph'], depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    try {
      visit(JSON.parse($(el).text()), 0);
    } catch {
      // Malformed JSON-LD is common; the page just has no author this way.
    }
  });
  return found;
}

function author($: CheerioAPI): string | undefined {
  const candidates = [
    meta($, 'author', 'article:author', 'parsely-author', 'twitter:creator'),
    jsonLdAuthor($),
    $('[rel="author"]').first().text(),
    $('[itemprop="author"]').first().text(),
  ];
  for (const candidate of candidates) {
    const text = clean(candidate);
    // `article:author` is often a profile link rather than a name.
    if (text && !/^https?:\/\//i.test(text)) return text.replace(/^by\s+/i, '');
  }
  return undefined;
}

function textLength($: CheerioAPI, el: Parameters<CheerioAPI>[0]): number {
  return $(el).text().replace(/\s+/g, ' ').trim().length;
}

/** Take out what is never content, then the furniture named as such. */
function strip($: CheerioAPI): void {
  $(NEVER_CONTENT).remove();
  $('body [class], body [id]').each((_, el) => {
    const node = $(el);
    const marks = `${node.attr('class') ?? ''} ${node.attr('id') ?? ''}`;
    if (FURNITURE.test(marks) && !CONTENT_HINT.test(marks)) node.remove();
  });
}

/**
 * Take out blocks that are mostly links — menus, tables of contents, language
 * pickers, "more from this site" grids — which sit inside the content area on
 * many sites. A block with real paragraphs of its own is left alone.
 */
function pruneLinkBlocks($: CheerioAPI, root: Parameters<CheerioAPI>[0]): void {
  $(root)
    .find('ul, ol, table, div, section')
    .each((_, el) => {
      const node = $(el);
      const text = node.text().replace(/\s+/g, ' ').trim();
      if (text.length < LINK_BLOCK_MIN_CHARS) return;
      const linked = node.find('a').text().replace(/\s+/g, ' ').trim().length;
      if (linked / text.length < LINK_BLOCK_DENSITY) return;
      if (node.find('p').length > 0) return;
      node.remove();
    });
}

/** The element holding the page's main text. */
function contentRoot($: CheerioAPI): HtmlNode | null {
  // The page's own answer, when it has one with real text in it. Of several
  // (an <article> inside <main>), the innermost that still holds most of the
  // text: the outer one only adds what surrounds the article.
  const declared: { node: unknown; length: number }[] = [];
  $('[itemprop="articleBody"], article, [role="main"], main').each((_, el) => {
    const length = $(el).find('p').text().replace(/\s+/g, ' ').trim().length;
    if (length >= MIN_CONTENT_CHARS) declared.push({ node: el, length });
  });
  if (declared.length > 0) {
    const most = Math.max(...declared.map((candidate) => candidate.length));
    const enough = declared.filter((candidate) => candidate.length >= most * 0.7);
    // Document order lists an ancestor before its descendants: the last is innermost.
    return enough[enough.length - 1]!.node as HtmlNode;
  }

  // Otherwise: every paragraph votes for its parent, and half for the parent's.
  const scores = new Map<unknown, number>();
  $('p, pre, blockquote').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length < 25) return;
    const score = 1 + (text.match(/,/g)?.length ?? 0) + Math.min(Math.floor(text.length / 100), 3);
    const parent = $(el).parent().get(0);
    if (!parent) return;
    scores.set(parent, (scores.get(parent) ?? 0) + score);
    const grandparent = $(parent).parent().get(0);
    if (grandparent) scores.set(grandparent, (scores.get(grandparent) ?? 0) + score / 2);
  });
  let best: { node: unknown; score: number } | null = null;
  for (const [node, score] of scores) {
    if (!best || score > best.score) best = { node, score };
  }
  const root = best?.node ?? $('body').get(0);
  if (!root || textLength($, root as Parameters<CheerioAPI>[0]) < MIN_CONTENT_CHARS) return null;
  return root as HtmlNode;
}

/**
 * Drop a leading heading that only repeats the page's title: the reader shows
 * the title above the text already.
 */
function withoutTitleHeading(markdown: string, title: string | undefined): string {
  const match = /^#{1,2} (.+)\n*/.exec(markdown);
  if (!match || !title) return markdown;
  const plain = (text: string) =>
    text.replace(/\\([\\`*_[\]<])/g, '$1').replace(/\s+/g, ' ').trim().toLowerCase();
  const heading = plain(match[1]!);
  const wanted = plain(title);
  return heading === wanted || wanted.startsWith(heading) ? markdown.slice(match[0].length) : markdown;
}

/** Cut at a paragraph break, so the reader never ends mid-sentence. */
function cap(markdown: string): string {
  if (markdown.length <= MAX_CONTENT_CHARS) return markdown;
  const cut = markdown.lastIndexOf('\n\n', MAX_CONTENT_CHARS);
  return `${markdown.slice(0, cut > 0 ? cut : MAX_CONTENT_CHARS).trimEnd()}\n\n*(The rest of this page was too long to keep.)*`;
}

function countWords(markdown: string): number {
  return markdown.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/** The first stretch of plain prose, for a page that describes itself nowhere. */
function leadFrom(markdown: string): string | undefined {
  for (const paragraph of markdown.split(/\n{2,}/)) {
    if (/^(#|>|```|\||!\[|- |\d+\. |---)/.test(paragraph)) continue;
    const text = paragraph
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\\([\\`*_[\]<])/g, '$1')
      .replace(/[*_`]/g, '');
    if (text.trim().length >= 40) return clean(text, MAX_EXCERPT_CHARS);
  }
  return undefined;
}

/**
 * Read `html`, fetched from `url` (the address after redirects, which relative
 * links and images resolve against).
 */
export function extractPage(html: string, url: string): ExtractedPage {
  const $ = load(html);

  // Metadata first: stripping the page takes some of it away.
  const title =
    meta($, 'og:title', 'twitter:title') ?? clean($('title').first().text()) ?? clean($('h1').first().text());
  const siteName = meta($, 'og:site_name', 'application-name');
  const description = meta($, 'og:description', 'description', 'twitter:description');
  const imageUrl = absoluteUrl(meta($, 'og:image', 'og:image:url', 'twitter:image'), url) ?? undefined;
  const ogType = meta($, 'og:type');
  const writtenBy = author($);

  strip($);
  const root = contentRoot($);
  if (root) pruneLinkBlocks($, root as unknown as Parameters<CheerioAPI>[0]);
  const content = root ? cap(withoutTitleHeading(toMarkdown(root, url), title)) : '';
  const wordCount = countWords(content);

  const kind: BookmarkKind =
    kindFromUrl(url) ?? (ogType?.startsWith('video') ? 'video' : wordCount >= ARTICLE_WORDS ? 'article' : 'page');

  return {
    title: clean(title),
    site_name: clean(siteName),
    author: writtenBy,
    excerpt: clean(description, MAX_EXCERPT_CHARS) ?? leadFrom(content),
    image_url: imageUrl,
    kind,
    content,
    word_count: wordCount,
  };
}
