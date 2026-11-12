/**
 * Turn a fetched page's main content into Markdown.
 *
 * The reader never renders a page's own HTML: what is stored and shown is this
 * conversion, which keeps headings, paragraphs, lists, quotes, code, tables,
 * links and images, and drops everything else — scripts, styles, attributes,
 * embeds. Links and images are made absolute and limited to http(s) (and
 * `mailto:` for links), so nothing a page wrote can run or point somewhere odd.
 */

/** The parts of a parsed HTML node this walks (htmlparser2's shape, via cheerio). */
export interface HtmlNode {
  type: string;
  /** Text nodes. */
  data?: string;
  /** Elements. */
  name?: string;
  attribs?: Record<string, string>;
  children?: HtmlNode[];
}

interface Context {
  /** What relative links and images resolve against. */
  baseUrl: string;
}

const SKIPPED = new Set([
  'script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'svg', 'canvas',
  'form', 'button', 'input', 'select', 'textarea', 'nav', 'dialog', 'audio', 'video', 'head',
]);

const BLOCKS = new Set([
  'p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'figure', 'details',
  'summary', 'address', 'dl', 'dt', 'dd', 'center',
]);

/** Characters that would otherwise start Markdown formatting inside running text. */
function escapeText(text: string): string {
  return text.replace(/[\\`*_[\]<]/g, '\\$&');
}

/** An address made absolute against the page, or `null` when it isn't one we keep. */
export function absoluteUrl(raw: string | undefined, baseUrl: string, allowMailto = false): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    if (allowMailto && url.protocol === 'mailto:') return url.toString();
  } catch {
    // Not an address.
  }
  return null;
}

/** A URL as a Markdown link destination: spaces and parentheses can't appear raw. */
function destination(url: string): string {
  return url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function textOf(node: HtmlNode): string {
  if (node.type === 'text') return node.data ?? '';
  return (node.children ?? []).map(textOf).join('');
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function children(node: HtmlNode, ctx: Context): string {
  return (node.children ?? []).map((child) => render(child, ctx)).join('');
}

/** Children as one line of inline Markdown (a heading, a table cell, a link's text). */
function inline(node: HtmlNode, ctx: Context): string {
  return collapse(children(node, ctx).replace(/\n+/g, ' ')).trim();
}

function block(content: string): string {
  const trimmed = content.trim();
  return trimmed ? `\n\n${trimmed}\n\n` : '';
}

function wrap(marker: string, node: HtmlNode, ctx: Context): string {
  const content = children(node, ctx);
  const inner = content.trim();
  if (!inner) return content;
  // Keep the spaces outside the markers: `** bold**` isn't bold.
  const lead = /^\s/.test(content) ? ' ' : '';
  const trail = /\s$/.test(content) ? ' ' : '';
  return `${lead}${marker}${inner}${marker}${trail}`;
}

function list(node: HtmlNode, ctx: Context, ordered: boolean): string {
  const items = (node.children ?? []).filter((child) => child.name === 'li');
  const start = ordered ? Number.parseInt(node.attribs?.start ?? '1', 10) || 1 : 1;
  const lines = items.map((item, index) => {
    const marker = ordered ? `${start + index}. ` : '- ';
    const body = children(item, ctx)
      .trim()
      .replace(/\n{3,}/g, '\n\n');
    const indent = ' '.repeat(marker.length);
    return marker + body.split('\n').map((line, i) => (i === 0 || !line ? line : indent + line)).join('\n');
  });
  return block(lines.filter((line) => line.trim().length > 2).join('\n'));
}

function table(node: HtmlNode, ctx: Context): string {
  const rows: string[][] = [];
  const visit = (current: HtmlNode) => {
    for (const child of current.children ?? []) {
      if (child.name === 'tr') {
        const cells = (child.children ?? [])
          .filter((cell) => cell.name === 'td' || cell.name === 'th')
          .map((cell) => inline(cell, ctx).replace(/\|/g, '\\|'));
        if (cells.some((cell) => cell)) rows.push(cells);
      } else if (child.name === 'thead' || child.name === 'tbody' || child.name === 'tfoot') {
        visit(child);
      }
    }
  };
  visit(node);
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((row) => row.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  const [head, ...body] = rows;
  return block([line(head!), line(Array.from({ length: width }, () => '---')), ...body.map(line)].join('\n'));
}

function image(node: HtmlNode, ctx: Context): string {
  const attribs = node.attribs ?? {};
  // A 1×1 image is a tracking pixel, not a picture.
  if (attribs.width === '1' || attribs.height === '1') return '';
  const src = absoluteUrl(attribs.src, ctx.baseUrl) ?? absoluteUrl(attribs['data-src'], ctx.baseUrl);
  if (!src) return '';
  const alt = escapeText(collapse(attribs.alt ?? '').trim());
  return `![${alt}](${destination(src)})`;
}

function render(node: HtmlNode, ctx: Context): string {
  if (node.type === 'text') {
    return escapeText(collapse(node.data ?? ''));
  }
  const name = node.name;
  if (!name || node.type === 'comment' || node.type === 'directive') return '';
  if (SKIPPED.has(name)) return '';

  if (/^h[1-6]$/.test(name)) {
    const text = inline(node, ctx);
    return text ? block(`${'#'.repeat(Number(name[1]))} ${text}`) : '';
  }
  if (BLOCKS.has(name)) return block(children(node, ctx));

  switch (name) {
    case 'br':
      return '  \n';
    case 'hr':
      return block('---');
    case 'strong':
    case 'b':
      return wrap('**', node, ctx);
    case 'em':
    case 'i':
      return wrap('*', node, ctx);
    case 'code': {
      const text = collapse(textOf(node)).trim();
      if (!text) return '';
      // A longer fence than any run of backticks inside.
      const fence = '`'.repeat(Math.max(1, ...(text.match(/`+/g) ?? []).map((run) => run.length + 1)));
      const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
      return `${fence}${pad}${text}${pad}${fence}`;
    }
    case 'pre': {
      const text = textOf(node).replace(/\n+$/, '');
      if (!text.trim()) return '';
      const code = (node.children ?? []).find((child) => child.name === 'code');
      const language = /(?:language|lang)-([\w+-]+)/.exec(
        `${node.attribs?.class ?? ''} ${code?.attribs?.class ?? ''}`,
      )?.[1];
      const fence = '`'.repeat(Math.max(3, ...(text.match(/`+/g) ?? []).map((run) => run.length + 1)));
      return `\n\n${fence}${language ?? ''}\n${text}\n${fence}\n\n`;
    }
    case 'a': {
      const text = inline(node, ctx);
      if (!text) return '';
      const href = absoluteUrl(node.attribs?.href, ctx.baseUrl, true);
      return href ? `[${text}](${destination(href)})` : text;
    }
    case 'img':
      return image(node, ctx);
    case 'ul':
      return list(node, ctx, false);
    case 'ol':
      return list(node, ctx, true);
    case 'blockquote': {
      const content = children(node, ctx).trim().replace(/\n{3,}/g, '\n\n');
      if (!content) return '';
      return block(content.split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n'));
    }
    case 'table':
      return table(node, ctx);
    case 'figcaption': {
      const text = inline(node, ctx);
      return text ? block(`*${text}*`) : '';
    }
    default:
      return children(node, ctx);
  }
}

/** A page's content node as Markdown. Links and images resolve against `baseUrl`. */
export function toMarkdown(root: HtmlNode, baseUrl: string): string {
  return children(root, { baseUrl })
    .split('\n')
    // Trailing spaces go, except the two that mean a line break.
    .map((line) => (line.endsWith('  ') && line.trim() ? `${line.trimEnd()}  ` : line.trimEnd()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
