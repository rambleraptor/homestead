import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { HOMESTEAD_VERSION } from './version.ts';

/** AI providers the scaffolder can wire into homestead.config.ts. */
export type AiProvider = 'anthropic' | 'openai' | 'google';

/** A resolved AI choice: which provider, which model, and the env var
 *  holding the API key (referenced from the generated config, never inlined). */
export interface AiChoice {
  provider: AiProvider;
  model: string;
  keyEnv: string;
}

/**
 * Per-provider defaults. Models are the documented vision-capable examples
 * (see AiConfig in @rambleraptor/homestead-core/apps/config); the key env var
 * is the name each provider's SDK conventionally reads.
 */
export const AI_PROVIDER_DEFAULTS: Record<AiProvider, { model: string; keyEnv: string }> = {
  anthropic: { model: 'claude-3-5-sonnet-latest', keyEnv: 'ANTHROPIC_API_KEY' },
  openai: { model: 'gpt-4o', keyEnv: 'OPENAI_API_KEY' },
  google: { model: 'gemini-2.5-flash', keyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY' },
};

/** Narrow a raw string to an AiProvider, or throw with the valid set. */
export function parseAiProvider(raw: string): AiProvider {
  if (raw === 'anthropic' || raw === 'openai' || raw === 'google') return raw;
  throw new Error(`unknown AI provider "${raw}" — expected anthropic, openai, or google`);
}

/** Build an AiChoice for a provider, applying optional model/key overrides. */
export function aiChoiceFor(
  provider: AiProvider,
  overrides: { model?: string; keyEnv?: string } = {},
): AiChoice {
  const d = AI_PROVIDER_DEFAULTS[provider];
  return {
    provider,
    model: overrides.model?.trim() || d.model,
    keyEnv: overrides.keyEnv?.trim() || d.keyEnv,
  };
}

/**
 * Known API-key env var names, in preference order, mapped to the provider
 * they imply. Used to infer an AI choice from an existing `.env`.
 */
const ENV_KEY_PROVIDERS: ReadonlyArray<readonly [string, AiProvider]> = [
  ['ANTHROPIC_API_KEY', 'anthropic'],
  ['OPENAI_API_KEY', 'openai'],
  ['GOOGLE_GENERATIVE_AI_API_KEY', 'google'],
  ['GEMINI_API_KEY', 'google'],
];

/** Parse a `.env` file body into a KEY→value map (comments/blanks skipped). */
export function parseEnvKeys(contents: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let key = line.slice(0, eq).trim();
    if (key.startsWith('export ')) key = key.slice('export '.length).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out.set(key, value);
  }
  return out;
}

/**
 * Inspect `<dir>/.env` for a known API-key var with a non-empty value and,
 * if found, return the AI choice it implies. Returns null when there's no
 * `.env` or nothing recognizable — the caller falls back to "none".
 */
export function inferAiFromEnv(dir: string): AiChoice | null {
  const envPath = resolve(dir, '.env');
  if (!existsSync(envPath)) return null;
  const keys = parseEnvKeys(readFileSync(envPath, 'utf8'));
  for (const [name, provider] of ENV_KEY_PROVIDERS) {
    if ((keys.get(name) ?? '').length > 0) {
      return { provider, model: AI_PROVIDER_DEFAULTS[provider].model, keyEnv: name };
    }
  }
  return null;
}

/** A feature app from @rambleraptor/homestead-apps that `init` can wire in. */
export interface CatalogApp {
  /** kebab-case id / directory name / AppConfig.id. */
  slug: string;
  /** The named export in @rambleraptor/homestead-apps. */
  exportName: string;
  /** Human-facing display name. */
  display: string;
  /** One-line description shown in the picker. */
  description: string;
}

/**
 * The example feature apps that ship in @rambleraptor/homestead-apps, in the
 * order they appear in that package's barrel. `init` offers these for
 * inclusion. Kept in sync by hand with packages/homestead-apps/index.ts — the
 * compiled launcher can't import that package to enumerate it at runtime.
 */
export const APP_CATALOG: readonly CatalogApp[] = [
  {
    slug: 'credit-cards',
    exportName: 'creditCardsApp',
    display: 'Credit Cards',
    description: 'Track credit card perks and maximize rewards',
  },
  {
    slug: 'documents',
    exportName: 'documentsApp',
    display: 'Documents',
    description: 'Store documents and parse their details automatically',
  },
  {
    slug: 'events',
    exportName: 'eventsApp',
    display: 'Events',
    description: 'Track yearly-recurring household events',
  },
  {
    slug: 'games',
    exportName: 'gamesApp',
    display: 'Games',
    description: 'Track games you play with the people in your life',
  },
  {
    slug: 'gift-cards',
    exportName: 'giftCardsApp',
    display: 'Gift Cards',
    description: 'Manage and track household gift cards',
  },
  {
    slug: 'groceries',
    exportName: 'groceriesApp',
    display: 'Groceries',
    description: 'Manage your grocery list with smart categorization',
  },
  {
    slug: 'home',
    exportName: 'homeApp',
    display: 'Home',
    description: 'Curb pickups and home documents in one place',
  },
  {
    slug: 'people',
    exportName: 'peopleApp',
    display: 'People',
    description: 'Manage contact information and important dates for people you know',
  },
  {
    slug: 'receipts',
    exportName: 'receiptsApp',
    display: 'Receipts',
    description: 'Medical and charitable receipts, kept for tax time',
  },
  {
    slug: 'recipes',
    exportName: 'recipesApp',
    display: 'Recipes',
    description: 'Manage household recipes with structured ingredients',
  },
  {
    slug: 'todos',
    exportName: 'todosApp',
    display: 'Todos',
    description: 'Daily todo list with shared and private items',
  },
];

/**
 * Resolve raw app selectors (each a slug or export name, case-insensitive) to
 * catalog entries — de-duplicated and returned in catalog order. Throws with
 * the valid set on an unknown selector.
 */
export function resolveApps(selectors: string[]): CatalogApp[] {
  const chosen = new Set<string>();
  for (const raw of selectors) {
    const key = raw.trim().toLowerCase();
    if (!key) continue;
    const match = APP_CATALOG.find(
      (a) => a.slug === key || a.exportName.toLowerCase() === key,
    );
    if (!match) {
      throw new Error(
        `unknown app "${raw}" — expected one of: ${APP_CATALOG.map((a) => a.slug).join(', ')}`,
      );
    }
    chosen.add(match.slug);
  }
  return APP_CATALOG.filter((a) => chosen.has(a.slug));
}

/** Files whose presence means "existing project" — scaffold refuses to clobber. */
const CONFLICT_FILES = ['homestead.config.ts', 'package.json'] as const;

export interface ScaffoldOptions {
  /** When set, wire an `ai` block into the generated homestead.config.ts. */
  ai?: AiChoice;
  /** Example apps from @rambleraptor/homestead-apps to wire into the config. */
  apps?: readonly CatalogApp[];
}

/**
 * Scaffold a starter Homestead project: homestead.config.ts, a package.json
 * declaring the homestead packages (the launcher resolves the server, the SPA
 * shell, and vite through the project's node_modules), and an apps/ directory.
 *
 * Safe to run in a folder that already holds unrelated files (e.g. a `.env`
 * or a git checkout): it refuses only when a file it generates
 * (homestead.config.ts / package.json) already exists, and writes the
 * ancillary `.gitignore` / `apps/README.md` only when they're absent so an
 * operator's own versions are never overwritten.
 */
export function scaffold(dir: string, opts: ScaffoldOptions = {}): string {
  const root = resolve(dir);
  mkdirSync(root, { recursive: true });

  for (const name of CONFLICT_FILES) {
    if (existsSync(join(root, name))) {
      throw new Error(
        `${join(root, name)} already exists — this looks like an existing Homestead project; pick a fresh directory`,
      );
    }
  }

  // Always written (guarded above so they can't clobber).
  const created: Array<[string, string]> = [
    [join(root, 'homestead.config.ts'), configTs(opts.ai, opts.apps ?? [])],
    [join(root, 'package.json'), packageJson(root)],
  ];
  // Written only if absent — never overwrite an operator's existing versions.
  const ifAbsent: Array<[string, string]> = [
    [join(root, 'apps', 'README.md'), APPS_README],
    [join(root, '.gitignore'), GITIGNORE],
  ];
  for (const [path, body] of created) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
  for (const [path, body] of ifAbsent) {
    if (existsSync(path)) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
  return root;
}

/** Version range for the scaffolded homestead packages. */
const HOMESTEAD_VERSION_RANGE = `^${HOMESTEAD_VERSION}`;

function packageJson(root: string): string {
  // npm package-name rules: lowercase, no spaces; fall back when the
  // directory name has nothing usable.
  const name =
    basename(root)
      .toLowerCase()
      .replace(/[^a-z0-9-_.]+/g, '-')
      .replace(/^[-_.]+|[-_.]+$/g, '') || 'my-homestead';
  const pkg = {
    name,
    private: true,
    type: 'module',
    dependencies: {
      '@rambleraptor/homestead-app': HOMESTEAD_VERSION_RANGE,
      '@rambleraptor/homestead-apps': HOMESTEAD_VERSION_RANGE,
      '@rambleraptor/homestead-core': HOMESTEAD_VERSION_RANGE,
      '@rambleraptor/homestead-server': HOMESTEAD_VERSION_RANGE,
    },
    // tsx lets the launcher run the server under node when bun isn't
    // installed (it also arrives transitively via homestead-server).
    devDependencies: {
      tsx: '^4.20.0',
    },
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/** The `ai` block injected into the generated config when a provider is chosen. */
function aiBlock(ai: AiChoice): string {
  return `
  // AI features (the chat assistant + image-extraction methods). The API key is
  // read from the environment when the launcher evaluates this file
  // server-side, so it never reaches the browser bundle. Set ${ai.keyEnv} in
  // your environment (or a .env file) before running \`homestead start\`.
  ai: {
    provider: '${ai.provider}',
    model: '${ai.model}',
    auth: { apiKey: process.env.${ai.keyEnv} ?? '' },
  },
`;
}

/**
 * Render homestead.config.ts, optionally with an `ai` block and a set of
 * example apps wired in. With no apps chosen the `apps` array and the
 * `@rambleraptor/homestead-apps` import are emitted commented-out as a
 * starting point; with apps chosen they're wired in live.
 */
function configTs(ai: AiChoice | undefined, apps: readonly CatalogApp[]): string {
  const hasApps = apps.length > 0;
  const importBlock = hasApps
    ? `import {\n${apps.map((a) => `  ${a.exportName},`).join('\n')}\n} from '@rambleraptor/homestead-apps';`
    : `// import {
//   giftCardsApp,
//   groceriesApp,
//   recipesApp,
//   todosApp,
// } from '@rambleraptor/homestead-apps';`;
  const appsList = hasApps
    ? apps.map((a) => `    ${a.exportName},`).join('\n')
    : `    // todosApp,
    // giftCardsApp,
    // groceriesApp,
    // recipesApp,`;
  return `/**
 * Homestead instance configuration.
 *
 * Apps come from two places:
 *
 *   1. npm-installed example apps — import from
 *      \`@rambleraptor/homestead-apps\` and list them in \`apps\` below.
 *      The example set is already a dependency; only the apps you list
 *      are bundled.
 *
 *   2. Custom apps — anything under ./apps/<dir>/app.homestead.ts is
 *      discovered automatically; no wiring here needed. Scaffold one
 *      with \`homestead init-app <name>\`.
 */

${importBlock}
import type { HomesteadConfig } from '@rambleraptor/homestead-core/apps/config';

const config: HomesteadConfig = {
  // The dashboard, notifications, settings, superuser, users, and chat apps
  // are always installed — you don't list them here.
  apps: [
${appsList}
  ],
${ai ? aiBlock(ai) : ''}};

// Tip: a running \`homestead start\` watches this file and the apps/ tree —
// edit them and it rebuilds the SPA and reapplies config automatically; open
// tabs reload on their own.

export default config;
`;
}

const APPS_README = `# Custom Apps

Each subdirectory with an \`app.homestead.ts\` file (default-exporting
its AppConfig) is picked up automatically — no wiring in
\`../homestead.config.ts\` needed. Restart \`homestead start\` after
adding an app so the server syncs its resources.

Run \`homestead init-app <name>\` to scaffold a new app skeleton here.
`;

/** Names derived from a raw app name, used across the scaffolded files. */
export interface AppNames {
  /** kebab-case identifier: directory name, AppConfig.id, and basePath. */
  slug: string;
  /** Title Case display name (AppConfig.name). */
  display: string;
  /** PascalCase, e.g. for the home component (`<Pascal>Home`). */
  pascal: string;
  /** camelCase export base; the exported config is `<camel>App`. */
  camel: string;
  /** kebab-case resource singular (slug with a trailing "s" trimmed). */
  singular: string;
  /** PascalCase of the singular — the record interface name. */
  singularPascal: string;
  /** SCREAMING_SNAKE constant naming the collection plural. */
  pluralConst: string;
}

/** Split a raw name into lowercase word tokens (letters + digits). */
function words(raw: string): string[] {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // split camelCase
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function pascal(tokens: string[]): string {
  return tokens.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/** Derive every name variant the app skeleton needs from a raw input. */
export function appNames(raw: string): AppNames {
  const tokens = words(raw);
  if (tokens.length === 0) {
    throw new Error(`"${raw}" has no usable letters or digits for an app name`);
  }
  const slug = tokens.join('-');
  const singularTokens = [...tokens];
  const last = singularTokens[singularTokens.length - 1];
  if (last.length > 1 && last.endsWith('s')) {
    singularTokens[singularTokens.length - 1] = last.slice(0, -1);
  }
  const camelHead = tokens[0];
  const camel = camelHead + pascal(tokens.slice(1));
  return {
    slug,
    display: tokens.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    pascal: pascal(tokens),
    camel,
    singular: singularTokens.join('-'),
    singularPascal: pascal(singularTokens),
    pluralConst: tokens.join('_').toUpperCase(),
  };
}

/**
 * Scaffold a custom app skeleton under `<cwd>/apps/<slug>/`: an AppConfig
 * (`app.homestead.ts`, auto-discovered on boot, with a starter resource
 * defined inline) and a home component. Refuses to overwrite an existing
 * app directory.
 */
export function scaffoldApp(raw: string, cwd = '.'): { dir: string; names: AppNames } {
  const names = appNames(raw);
  const dir = resolve(cwd, 'apps', names.slug);
  if (existsSync(dir)) {
    throw new Error(`apps/${names.slug} already exists — pick a different name`);
  }

  const files: Array<[string, string]> = [
    [join(dir, 'app.homestead.ts'), appConfigTs(names)],
    [join(dir, 'components', `${names.pascal}Home.tsx`), appHomeTsx(names)],
  ];
  for (const [path, body] of files) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
  return { dir, names };
}

function appConfigTs(n: AppNames): string {
  return `/**
 * ${n.display} App Configuration
 *
 * Auto-discovered: any apps/<dir>/app.homestead.ts default-exporting an
 * AppConfig is picked up on boot — no homestead.config.ts wiring needed.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

export const ${n.camel}App: AppConfig = {
  id: '${n.slug}',
  name: '${n.display}',
  description: 'TODO: describe what ${n.display} does.',
  // A starter resource. Add fields or more resources as your app grows.
  resources: [
    {
      singular: '${n.singular}',
      plural: '${n.slug}',
      description: 'TODO: describe this resource.',
      fields: {
        name: { type: 'string', description: 'Display name.', required: true },
        created_by: { type: 'string', description: 'users/{user_id}' },
      },
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.Package),
    basePath: '/${n.slug}',
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/${n.pascal}Home').then((m) => m.${n.pascal}Home),
      },
    ],
    showInNav: true,
    navOrder: 100,
  },
};

export default ${n.camel}App;
`;
}

function appHomeTsx(n: AppNames): string {
  return `/**
 * ${n.display} home page. Rendered at the app's index route (\`/${n.slug}\`).
 *
 * Fetch data with hooks built on the aepbase client
 * (\`@rambleraptor/homestead-core/api/aepbase\`).
 */
export function ${n.pascal}Home() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">${n.display}</h1>
      <p className="mt-2 text-gray-600">
        Your new app starts here. Edit
        <code className="mx-1">apps/${n.slug}/components/${n.pascal}Home.tsx</code>
        to build it out.
      </p>
    </div>
  );
}
`;
}

const GITIGNORE = `# Local server data (sqlite db + uploaded files)
data/

# Backup archives, and the data dir a restore renames aside. Both hold the
# same household data as data/ — committing one would publish the lot.
homestead-backup-*.tar.gz
*.pre-restore-*

# Dependencies
node_modules/

# Launcher cache
.homestead/
`;
