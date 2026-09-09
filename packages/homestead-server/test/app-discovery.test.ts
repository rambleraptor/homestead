import { afterEach, describe, expect, test } from 'vitest';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appsDirs,
  discoverApps,
  discoveredAppFiles,
  parseAppsDirs,
} from '@rambleraptor/homestead-core/server/app-discovery';
import { mergeDiscoveredApps } from '@rambleraptor/homestead-core/apps/discovery';

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));
const APPS = join(FIXTURES, 'discovery-apps');
const EXTRA = join(FIXTURES, 'discovery-apps-extra');

describe('discoverApps', () => {
  test('imports <dir>/*/app.homestead.ts sorted by directory name', async () => {
    const apps = await discoverApps([APPS]);
    expect(apps.map((m) => m.id)).toEqual(['alpha', 'beta']);
    expect(apps.map((m) => m.name)).toEqual(['Alpha', 'Beta']);
    // The not-an-app/ subdir (no app.homestead.ts) was skipped silently.
  });

  test('scans several directories, in the order they were given', async () => {
    expect((await discoverApps([APPS, EXTRA])).map((m) => m.id)).toEqual([
      'alpha',
      'beta',
      'alpha',
      'gamma',
    ]);
    expect((await discoverApps([EXTRA, APPS])).map((m) => m.name)).toEqual([
      'Alpha (extra)',
      'Gamma',
      'Alpha',
      'Beta',
    ]);
  });

  test('leaves a cross-directory id collision for mergeDiscoveredApps to settle', async () => {
    const merged = mergeDiscoveredApps([], await discoverApps([APPS, EXTRA]));
    expect(merged.map((m) => m.id)).toEqual(['alpha', 'beta', 'gamma']);
    // First directory wins.
    expect(merged[0]!.name).toBe('Alpha');
  });

  test('returns [] for missing app directories', async () => {
    expect(await discoverApps([join(FIXTURES, 'does-not-exist')])).toEqual([]);
    expect(await discoverApps([])).toEqual([]);
  });

  test('throws (naming the file) when the default export is missing', async () => {
    await expect(
      discoverApps([join(FIXTURES, 'discovery-bad')]),
    ).rejects.toThrow(/app\.homestead\.ts must default-export/);
  });
});

describe('discoveredAppFiles', () => {
  test('lists the app config files without importing them', () => {
    expect(discoveredAppFiles([APPS])).toEqual([
      join(APPS, 'alpha-app', 'app.homestead.ts'),
      join(APPS, 'beta-app', 'app.homestead.ts'),
    ]);
  });
});

describe('parseAppsDirs', () => {
  test('splits on the path delimiter, dropping blanks', () => {
    expect(parseAppsDirs(`/a${delimiter}${delimiter} /b `, '/base')).toEqual(['/a', '/b']);
  });

  test('resolves relative entries against the base, and de-duplicates', () => {
    expect(parseAppsDirs(`apps${delimiter}/base/apps${delimiter}shared`, '/base')).toEqual([
      '/base/apps',
      '/base/shared',
    ]);
  });

  test('yields nothing for an unset or empty value', () => {
    expect(parseAppsDirs(undefined, '/base')).toEqual([]);
    expect(parseAppsDirs(` ${delimiter} `, '/base')).toEqual([]);
  });
});

describe('appsDirs', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  test('prefers HOMESTEAD_APPS_DIRS over the single-dir override', () => {
    expect(
      appsDirs(
        {
          HOMESTEAD_APPS_DIRS: `apps${delimiter}/srv/shared-apps`,
          HOMESTEAD_APPS_DIR: '/ignored',
        },
        '/base',
      ),
    ).toEqual(['/base/apps', '/srv/shared-apps']);
  });

  test('falls back to HOMESTEAD_APPS_DIR, then <base>/apps', () => {
    expect(appsDirs({ HOMESTEAD_APPS_DIR: '/tmp/somewhere/apps' }, '/base')).toEqual([
      '/tmp/somewhere/apps',
    ]);
    expect(appsDirs({}, '/base')).toEqual(['/base/apps']);
  });

  test('reads process.env and cwd by default', () => {
    delete process.env.HOMESTEAD_APPS_DIRS;
    delete process.env.HOMESTEAD_APPS_DIR;
    expect(appsDirs()).toEqual([join(process.cwd(), 'apps')]);
    process.env.HOMESTEAD_APPS_DIRS = `/one${delimiter}/two`;
    expect(appsDirs()).toEqual(['/one', '/two']);
  });
});
