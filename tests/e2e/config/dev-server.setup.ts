/**
 * Spawn the Next.js dev server with the env vars its instrumentation
 * hook needs to push the aepbase schema on boot. Replaces Playwright's
 * built-in `webServer` config so we can guarantee aepbase is up first
 * (Playwright starts `webServer` before `globalSetup`, which would have
 * left the dev server with no aepbase to talk to).
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { get as httpGet } from 'http';
import { getAepbaseUrl, getProjectRoot, type AepbaseAdminCreds } from './aepbase.setup';

const DEV_SERVER_URL = 'http://localhost:3000';
const READY_TIMEOUT_MS = 120000;
const POLL_INTERVAL_MS = 500;

let devServerProcess: ChildProcess | null = null;

export function getDevServerUrl(): string {
  return DEV_SERVER_URL;
}

/**
 * Start the Next.js dev server and resolve once it's listening on
 * port 3000 AND the instrumentation hook has applied the schema to
 * aepbase. Throws if either condition isn't met within the timeout.
 */
export async function startDevServer(creds: AepbaseAdminCreds): Promise<void> {
  if (process.env.PLAYWRIGHT_REUSE_DEV_SERVER && (await ping(DEV_SERVER_URL))) {
    console.log(`✅ Reusing existing dev server at ${DEV_SERVER_URL}`);
    return;
  }

  const cwd = join(getProjectRoot(), 'frontend');
  devServerProcess = spawn('npm', ['run', 'dev'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      AEPBASE_URL: getAepbaseUrl(),
      AEPBASE_ADMIN_EMAIL: creds.email,
      AEPBASE_ADMIN_PASSWORD: creds.password,
      __NEXT_DISABLE_OVERLAY: '1',
    },
  });

  devServerProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[next] ${chunk}`);
  });
  devServerProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[next ERR] ${chunk}`);
  });

  const exitedEarly = new Promise<never>((_, reject) => {
    devServerProcess?.once('close', (code) => {
      reject(new Error(`dev server exited early with code ${code}`));
    });
  });

  await Promise.race([
    waitFor(() => ping(DEV_SERVER_URL), READY_TIMEOUT_MS, 'dev server URL'),
    exitedEarly,
  ]);

  // The dev server can respond before the instrumentation hook has
  // finished pushing the schema (it runs async on first request).
  // Poll aepbase until a sentinel resource definition exists so tests
  // don't race the schema apply.
  await Promise.race([
    waitFor(
      () => sentinelResourceExists(creds.token),
      READY_TIMEOUT_MS,
      'schema sync',
    ),
    exitedEarly,
  ]);
}

export function stopDevServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!devServerProcess) {
      resolve();
      return;
    }
    devServerProcess.once('close', () => resolve());
    devServerProcess.kill();
    setTimeout(() => resolve(), 5000);
  });
}

function ping(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpGet(url, (res) => {
      // Anything that responds with HTTP — including 3xx redirects — counts.
      resolve(res.statusCode !== undefined && res.statusCode < 500);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function sentinelResourceExists(adminToken: string): Promise<boolean> {
  // `gift-card` is declared by gift-cards/resources.ts and applied by
  // the instrumentation runner. Its presence proves the runner ran.
  const res = await fetch(
    `${getAepbaseUrl()}/aep-resource-definitions/gift-card`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  ).catch(() => null);
  return res?.ok === true;
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}
