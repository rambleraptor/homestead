import { defineConfig } from 'vitepress';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const tagline = 'Build and deploy apps for you, your family, and your agents.';
const siteUrl = 'https://myhomestead.dev';

// A one-sentence, machine-quotable definition. Generative engines (Gemini,
// Claude, ChatGPT, Perplexity) lift sentences like this verbatim, so it lives
// in the JSON-LD description and the OG/meta description below.
const definition =
  'Homestead is an open-source, self-hosted platform for building and deploying ' +
  'personal apps for you, your family, and your AI agents. You define a data model ' +
  'and get a database, a REST API, a CLI, an AI chatbot, and optional React apps on top.';

// schema.org SoftwareApplication — gives crawlers and LLMs structured, extractable
// facts about the project instead of forcing them to infer from prose.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Homestead',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Linux',
  description: definition,
  url: siteUrl,
  softwareHelp: `${siteUrl}/guides/`,
  license: 'https://opensource.org/licenses/MIT',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  codeRepository: 'https://github.com/rambleraptor/homestead',
  keywords:
    'self-hosted, personal apps, family apps, AI agents, low-code, REST API, SQLite, self-hosted software',
};

export default defineConfig({
  title: 'Homestead',
  description: tagline,
  cleanUrls: true,
  appearance: false,
  ignoreDeadLinks: [/^https?:\/\/localhost/],
  sitemap: { hostname: siteUrl },
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/homestead-icon.png' }],
    ['meta', { name: 'description', content: tagline }],
    ['script', { type: 'application/ld+json' }, JSON.stringify(jsonLd)],
    ['meta', { property: 'og:title', content: 'Homestead' }],
    ['meta', { property: 'og:description', content: tagline }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Homestead' }],
    ['meta', { property: 'og:image', content: `${siteUrl}/homestead-icon.png` }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'theme-color', content: '#1f3a2e' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..600&family=Outfit:wght@300..600&display=swap',
      },
    ],
  ],
  transformHead({ pageData }) {
    const path = pageData.relativePath
      .replace(/(^|\/)index\.md$/, '$1')
      .replace(/\.md$/, '');
    const canonical = `${siteUrl}/${path}`;
    return [
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:url', content: canonical }],
    ];
  },
  // Generate /llms-full.txt: the entire doc set concatenated as clean markdown,
  // so a generative engine can ingest everything Homestead is in one fetch.
  // (llms.txt — the curated index — is hand-maintained in docs/public.)
  buildEnd(siteConfig) {
    const { srcDir, outDir, pages } = siteConfig;
    const sections = pages
      .filter((p) => p !== '404.md')
      .sort()
      .map((rel) => {
        const raw = readFileSync(join(srcDir, rel), 'utf-8');
        // Strip YAML frontmatter; the title/description live in the body headings.
        const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
        const url = `${siteUrl}/${rel.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')}`;
        return `<!-- source: ${url} -->\n\n${body}`;
      });
    const full = `# Homestead — full documentation\n\n> ${definition}\n\n${sections.join('\n\n---\n\n')}\n`;
    writeFileSync(join(outDir, 'llms-full.txt'), full);
  },
  themeConfig: {
    logo: '/homestead-icon.png',
    siteTitle: 'Homestead',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Docs', link: '/guides/' },
      { text: 'GitHub', link: 'https://github.com/rambleraptor/homestead' },
    ],
    sidebar: {
      '/guides/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Installation', link: '/guides/installation' },
            { text: 'Quick Start', link: '/guides/quick-start' },
            { text: 'AI Support', link: '/guides/ai' },
            { text: 'Example Apps', link: '/guides/apps' },
          ],
        },
        {
          text: 'App Development',
          items: [
            { text: 'App Config', link: '/guides/app-config' },
            { text: 'Defining Resources', link: '/guides/resources' },
            { text: 'State Management', link: '/guides/state-management' },
            { text: 'Offline Support', link: '/guides/offline' },
            { text: 'Live Updates', link: '/guides/events' },
          ],
        },
        {
          text: 'Adding App Features',
          items: [
            { text: 'Dashboard Widgets', link: '/guides/widgets' },
            { text: 'App Flags', link: '/guides/app-flags' },
            { text: 'Notifications', link: '/guides/notifications' },
            { text: 'Bulk Import', link: '/guides/bulk-import' },
            { text: 'Bulk Export', link: '/guides/bulk-export' },
          ],
        },
        {
          text: 'Using Homestead',
          items: [
            { text: 'Creating Users', link: '/guides/users' },
            { text: 'Access & Tags', link: '/guides/access' },
            { text: 'Permissions', link: '/guides/permissions' },
            { text: 'Backups & Restore', link: '/guides/backups' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/rambleraptor/homestead' },
    ],
    search: {
      provider: 'local',
    },
  },
});
