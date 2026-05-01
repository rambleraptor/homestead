/**
 * Apply the aepbase schema for e2e tests.
 *
 * Delegates to `frontend/scripts/apply-schema.ts` — the same CLI a
 * developer runs locally — so the e2e bootstrap stays in sync with
 * production without maintaining a parallel list of resource
 * definitions. See `frontend/src/core/aep/registry.ts` and the
 * per-module `resources.ts` files for the actual definitions.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getAepbaseUrl } from './aepbase.setup';

const FRONTEND_DIR = resolve(
  fileURLToPath(import.meta.url),
  '../../../../frontend',
);

export function applySchema(adminToken: string): Promise<void> {
  const result = spawnSync('npm', ['run', '--silent', 'apply-schema'], {
    cwd: FRONTEND_DIR,
    env: {
      ...process.env,
      AEPBASE_URL: getAepbaseUrl(),
      AEPBASE_TOKEN: adminToken,
    },
    stdio: 'inherit',
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(
      `apply-schema: child process exited with status ${result.status}` +
        (result.error ? ` (${result.error.message})` : ''),
    );
  }
  return Promise.resolve();
}
