import { describe, expect, it } from 'vitest';
import { load } from 'cheerio';
import { MAX_CONTENT_CHARS, extractPage } from '../extract/extractPage';
import { toMarkdown, type HtmlNode } from '../extract/toMarkdown';

const URL = 'https://news.example.com/2026/03/story';

/** Enough prose for a container to count as the page's content. */
const PROSE =
  'The council voted on Tuesday to rebuild the old bridge, ending a debate that had run for the better part of a decade. ' +
  'Engineers said the new span would open within two years, weather permitting, and would carry cyclists as well as cars.';

function md(html: string): string {
  const $ = load(`<div id="root">${html}</div>`);
  return toMarkdown($('#root').get(0) as unknown as HtmlNode, URL);
}

describe('toMarkdown', () => {
  it('keeps headings, paragraphs and emphasis', () => {
    expect(md('<h2>Part <em>one</em></h2><p>Some <strong>bold</strong> and <i>slanted</i> text.</p>')).toBe(
      '## Part *one*\n\nSome **bold** and *slanted* text.',
    );
  });

  it('keeps the space around emphasis outside the markers', () => {
    expect(md('<p>a<b> bold </b>b</p>')).toBe('a **bold** b');
  });

  it('makes links absolute and drops ones that are not web links', () => {
    expect(md('<p><a href="/about">About</a> <a href="javascript:alert(1)">Click</a> <a href="mailto:a@b.co">Mail</a></p>')).toBe(
      '[About](https://news.example.com/about) Click [Mail](mailto:a@b.co)',
    );
  });

  it('keeps images with their alt text, and drops tracking pixels and data URIs', () => {
    expect(
      md('<p><img src="pic one.jpg" alt="A bridge"><img src="/t.gif" width="1" height="1"><img src="data:image/png;base64,AAAA"></p>'),
    ).toBe('![A bridge](https://news.example.com/2026/03/pic%20one.jpg)');
  });

  it('writes lists, nested and numbered', () => {
    expect(md('<ul><li>One</li><li>Two<ul><li>Inner</li></ul></li></ul><ol start="3"><li>Three</li><li>Four</li></ol>')).toBe(
      '- One\n- Two\n\n  - Inner\n\n3. Three\n4. Four',
    );
  });

  it('writes quotes, rules and line breaks', () => {
    expect(md('<blockquote><p>First.</p><p>Second.</p></blockquote><hr><p>a<br>b</p>')).toBe(
      '> First.\n>\n> Second.\n\n---\n\na  \nb',
    );
  });

  it('fences code, keeping its whitespace and language', () => {
    expect(md('<pre><code class="language-js">if (a &lt; b) {\n  go();\n}</code></pre><p>Use <code>npm run</code>.</p>')).toBe(
      '```js\nif (a < b) {\n  go();\n}\n```\n\nUse `npm run`.',
    );
  });

  it('writes a simple table', () => {
    expect(md('<table><thead><tr><th>Name</th><th>Qty</th></tr></thead><tbody><tr><td>Flour</td><td>2 | 3</td></tr></tbody></table>')).toBe(
      '| Name | Qty |\n| --- | --- |\n| Flour | 2 \\| 3 |',
    );
  });

  it('drops scripts, styles, forms and embeds', () => {
    expect(
      md('<p>Kept.</p><script>steal()</script><style>p{}</style><form><input value="x"><button>Go</button></form><iframe src="https://x.test"></iframe>'),
    ).toBe('Kept.');
  });

  it('escapes characters that would become formatting or HTML', () => {
    expect(md('<p>2 * 3 = 6, a_b, [not a link], &lt;script&gt;alert(1)&lt;/script&gt;</p>')).toBe(
      '2 \\* 3 = 6, a\\_b, \\[not a link\\], \\<script>alert(1)\\</script>',
    );
  });
});

describe('extractPage', () => {
  it('reads the title, site, author, excerpt and image from the page’s metadata', () => {
    const page = extractPage(
      `<html><head>
        <title>Bridge to be rebuilt | Example News</title>
        <meta property="og:title" content="Bridge to be rebuilt">
        <meta property="og:site_name" content="Example News">
        <meta property="og:description" content="The council has voted.">
        <meta property="og:image" content="/img/bridge.jpg">
        <meta name="author" content="By Alex Reporter">
      </head><body><article><p>${PROSE}</p><p>${PROSE}</p></article></body></html>`,
      URL,
    );
    expect(page).toMatchObject({
      title: 'Bridge to be rebuilt',
      site_name: 'Example News',
      author: 'Alex Reporter',
      excerpt: 'The council has voted.',
      image_url: 'https://news.example.com/img/bridge.jpg',
    });
  });

  it('falls back to the <title>, JSON-LD author and the first paragraph', () => {
    const page = extractPage(
      `<html><head><title>  Bridge   news </title>
        <script type="application/ld+json">{"@graph":[{"@type":"Article","author":[{"name":"Sam Writer"},{"name":"Jo Editor"}]}]}</script>
      </head><body><main><h1>Bridge news</h1><p>${PROSE}</p><p>${PROSE}</p></main></body></html>`,
      URL,
    );
    expect(page.title).toBe('Bridge news');
    expect(page.author).toBe('Sam Writer, Jo Editor');
    expect(page.excerpt?.startsWith('The council voted on Tuesday')).toBe(true);
    expect(page.site_name).toBeUndefined();
  });

  it('does not take a profile link for an author', () => {
    const page = extractPage(
      `<html><head><meta property="article:author" content="https://facebook.com/someone"></head>
       <body><article><p>${PROSE}</p></article></body></html>`,
      URL,
    );
    expect(page.author).toBeUndefined();
  });

  it('keeps the article and leaves the furniture around it', () => {
    const page = extractPage(
      `<html><body>
        <nav><a href="/">Home</a><a href="/world">World</a></nav>
        <header class="masthead">Example News — subscribe today</header>
        <article>
          <h1>Bridge to be rebuilt</h1>
          <div class="share-bar">Share on everything</div>
          <p>${PROSE}</p>
          <h2>Background <span class="mw-editsection">[<a href="/edit">edit</a>]</span></h2>
          <aside>Related: the tunnel story</aside>
          <p>${PROSE}</p>
        </article>
        <div id="comments"><p>First! This is a very long comment that goes on and on, with commas, and more commas, to look like content.</p></div>
        <footer>© Example News</footer>
      </body></html>`,
      URL,
    );
    expect(page.content).toContain('The council voted on Tuesday');
    expect(page.content).toContain('## Background');
    for (const junk of ['Home', 'subscribe today', 'Share on everything', 'edit', 'tunnel story', 'First!', '©']) {
      expect(page.content).not.toContain(junk);
    }
    // The title heads the reader already.
    expect(page.content.startsWith('The council voted')).toBe(true);
    expect(page.kind).toBe('page');
    expect(page.word_count).toBeGreaterThan(60);
  });

  it('finds the text on a page with no <article>, by where the paragraphs are', () => {
    const page = extractPage(
      `<html><body>
        <div class="col-left"><p>Short teaser one.</p><p>Short teaser two.</p></div>
        <div class="story-text"><p>${PROSE}</p><p>${PROSE}</p><p>${PROSE}</p></div>
      </body></html>`,
      URL,
    );
    expect(page.content).toContain('The council voted on Tuesday');
    expect(page.content).not.toContain('teaser');
    expect(page.kind).toBe('article');
  });

  it('takes the article inside <main>, not everything around it', () => {
    const page = extractPage(
      `<html><body><main>
        <div class="hero"><p>Welcome to Example News, your daily source for bridges.</p></div>
        <article><p>${PROSE}</p><p>${PROSE}</p></article>
      </main></body></html>`,
      URL,
    );
    expect(page.content).toContain('The council voted on Tuesday');
    expect(page.content).not.toContain('Welcome to Example News');
  });

  it('drops menus and language pickers that sit inside the content area', () => {
    const languages = ['Deutsch', 'Español', 'Français', 'Italiano', 'Nederlands', 'Polski']
      .map((name) => `<li><a href="/${name}">${name}</a></li>`)
      .join('');
    const page = extractPage(
      `<html><body><main>
        <ul>${languages}</ul>
        <div><a href="/a">Read the previous story in this series</a> <a href="/b">Read the next story in this series</a></div>
        <p>${PROSE}</p>
        <ul><li>Opens in 2028</li><li>Carries <a href="/bikes">cyclists</a> as well as cars and buses</li></ul>
        <p>${PROSE}</p>
      </main></body></html>`,
      URL,
    );
    expect(page.content).not.toContain('Deutsch');
    expect(page.content).not.toContain('previous story');
    // A list that is mostly words stays, links and all.
    expect(page.content).toContain('- Opens in 2028');
    expect(page.content).toContain('[cyclists](https://news.example.com/bikes)');
  });

  it('keeps nothing for a page with no text to speak of', () => {
    const page = extractPage('<html><head><title>Login</title></head><body><form><input></form><p>Sign in.</p></body></html>', URL);
    expect(page.content).toBe('');
    expect(page.word_count).toBe(0);
    expect(page.kind).toBe('page');
    expect(page.title).toBe('Login');
  });

  it('calls a video a video', () => {
    expect(extractPage('<html><head><meta property="og:type" content="video.other"></head><body></body></html>', URL).kind).toBe('video');
    expect(extractPage('<html><body></body></html>', 'https://www.youtube.com/watch?v=abc').kind).toBe('video');
  });

  it('caps a very long page at a paragraph break', () => {
    const paragraphs = Array.from({ length: 2500 }, () => `<p>${PROSE}</p>`).join('');
    const page = extractPage(`<html><body><article>${paragraphs}</article></body></html>`, URL);
    expect(page.content.length).toBeLessThan(MAX_CONTENT_CHARS + 100);
    expect(page.content.endsWith('*(The rest of this page was too long to keep.)*')).toBe(true);
  });
});
