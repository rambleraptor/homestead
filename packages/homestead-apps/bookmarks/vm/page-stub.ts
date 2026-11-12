/**
 * Stand-ins for the web pages a bookmark points at, served in-process through
 * the fetch shim so specs can exercise the real capture path (the sync, the
 * SSRF fence, extraction) without the network.
 *
 * The origin is an IP literal on purpose: the fence resolves a hostname before
 * fetching it, and a made-up name wouldn't resolve. A public literal passes
 * the fence as any public site would, and the shim answers it — nothing leaves
 * the process.
 */

import { registerService } from '@rambleraptor/homestead-test-harness/vm/fetch-shim';

export const PAGE_STUB_ORIGIN = 'http://93.184.216.34';

export const ARTICLE_URL = `${PAGE_STUB_ORIGIN}/sourdough`;
export const ARTICLE_TITLE = 'How to Keep a Sourdough Starter Alive';
export const BROKEN_URL = `${PAGE_STUB_ORIGIN}/gone`;
export const PDF_URL = `${PAGE_STUB_ORIGIN}/manual.pdf`;

const ARTICLE_HTML = `<!doctype html>
<html>
  <head>
    <title>How to Keep a Sourdough Starter Alive | The Daily Loaf</title>
    <meta property="og:title" content="${ARTICLE_TITLE}">
    <meta property="og:site_name" content="The Daily Loaf">
    <meta property="og:description" content="Feeding schedules, flour choices, and what to do when it smells like nail polish.">
    <meta name="author" content="Rosa Baker">
    <script>window.tracked = true;</script>
  </head>
  <body>
    <nav><a href="/">Home</a> <a href="/recipes">Recipes</a></nav>
    <article>
      <h1>${ARTICLE_TITLE}</h1>
      <p>A starter is a small pet that lives in a jar, and like any pet it does best on a routine.
      Feed it equal weights of flour and water once a day at room temperature, or once a week if it
      lives in the fridge, and it will reward you with bread for years.</p>
      <h2>Feeding</h2>
      <p>Discard all but a spoonful, then stir in fifty grams of flour and fifty grams of water.
      Whole-grain rye wakes up a sluggish starter faster than white flour does, because it carries
      more of the wild yeast and the food that yeast likes.</p>
      <ul><li>Use a clean jar</li><li>Keep the lid loose</li></ul>
      <p>If it smells sharp, like nail polish remover, it is only hungry: feed it twice a day until
      the smell turns back to yogurt. Read more in <a href="/troubleshooting">the troubleshooting guide</a>.</p>
    </article>
    <div class="related-posts"><p>You might also like our banana bread, our focaccia, and our bagels.</p></div>
    <footer>Copyright The Daily Loaf</footer>
  </body>
</html>`;

/** How many times each path was fetched, so a spec can tell a refetch happened. */
export interface PageStub {
  hits: Map<string, number>;
}

/** Serve the stub pages. Register in `beforeEach`; a later call replaces it. */
export function installPageStub(): PageStub {
  const hits = new Map<string, number>();
  registerService(PAGE_STUB_ORIGIN, async (req) => {
    const { pathname } = new URL(req.url);
    hits.set(pathname, (hits.get(pathname) ?? 0) + 1);
    if (pathname === '/sourdough') {
      return new Response(ARTICLE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (pathname === '/manual.pdf') {
      return new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } });
    }
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  });
  return { hits };
}
