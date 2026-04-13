/**
 * aepbase Test Instance Setup
 *
 * Manages an isolated aepbase instance for e2e tests. Builds the binary
 * via aepbase/install.sh (idempotent), starts it on a dedicated port with
 * a fresh data directory, captures the bootstrap superuser credentials
 * from stdout, and exposes them to the rest of the suite.
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { get as httpGet } from 'http';

const TEST_PORT = 8092;

let aepbaseProcess: ChildProcess | null = null;

export interface AepbaseAdminCreds {
  email: string;
  password: string;
  id: string;
  token: string;
}

export function getProjectRoot(): string {
  return join(process.cwd(), '../..');
}

export function getAepbaseUrl(): string {
  return `http://127.0.0.1:${TEST_PORT}`;
}

function getTestDirs() {
  const e2eDir = process.cwd();
  return {
    e2eDir,
    dataDir: join(e2eDir, 'aep_test_data'),
    aepbaseDir: join(getProjectRoot(), 'aepbase'),
    binary: join(getProjectRoot(), 'aepbase/bin/aepbase'),
    credsFile: join(e2eDir, 'aep_test_data', 'admin-creds.json'),
  };
}

/** Build the aepbase binary if it doesn't exist yet. Idempotent. */
function ensureBinaryBuilt(): void {
  const { binary, aepbaseDir } = getTestDirs();
  if (existsSync(binary)) return;
  console.log('🔨 Building aepbase binary (one-time)...');
  execSync('./install.sh', { cwd: aepbaseDir, stdio: 'inherit' });
}

/**
 * Start aepbase on TEST_PORT with a fresh data directory. Parses the
 * bootstrap credentials from stdout and resolves with them.
 */
export async function startAepbase(): Promise<AepbaseAdminCreds> {
  const { dataDir, binary, credsFile } = getTestDirs();

  // Fresh data directory
  if (existsSync(dataDir)) {
    await rm(dataDir, { recursive: true, force: true });
  }
  await mkdir(dataDir, { recursive: true });

  ensureBinaryBuilt();

  return new Promise((resolve, reject) => {
    aepbaseProcess = spawn(binary, [
      '-port', String(TEST_PORT),
      '-data-dir', dataDir,
      '-db', 'aepbase.db',
      '-cors-allowed-origins', '*',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let ready = false;
    let password: string | null = null;

    aepbaseProcess.stdout?.on('data', async (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(`[aepbase] ${text}`);

      // Parse "  Password: <16 hex chars>"
      const match = text.match(/Password:\s+([a-f0-9]{16})/);
      if (match) password = match[1];

      // aepbase logs something like "aepbase listening on :8092"
      if (text.includes('listening on') || text.includes('Listening on')) {
        if (!password) {
          // Wait briefly in case the password line lags
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!password) {
          reject(new Error('aepbase started but no bootstrap password captured'));
          return;
        }
        ready = true;
        const creds = await loginAdmin(password);
        await writeFile(credsFile, JSON.stringify(creds, null, 2));
        resolve(creds);
      }
    });

    aepbaseProcess.stderr?.on('data', (chunk) => {
      process.stderr.write(`[aepbase ERR] ${chunk.toString()}`);
    });

    aepbaseProcess.on('error', (err) => reject(err));
    aepbaseProcess.on('close', (code) => {
      if (!ready) {
        reject(new Error(`aepbase exited early with code ${code}\nOutput:\n${stdout}`));
      }
    });

    setTimeout(() => {
      if (!ready) {
        aepbaseProcess?.kill();
        reject(new Error('aepbase did not start within 15s'));
      }
    }, 15000);
  });
}

export function stopAepbase(): Promise<void> {
  return new Promise((resolve) => {
    if (!aepbaseProcess) {
      resolve();
      return;
    }
    aepbaseProcess.once('close', () => resolve());
    aepbaseProcess.kill();
    setTimeout(() => resolve(), 2000);
  });
}

async function loginAdmin(password: string): Promise<AepbaseAdminCreds> {
  const body = JSON.stringify({ email: 'admin@example.com', password });
  const res = await fetch(`${getAepbaseUrl()}/users/:login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    throw new Error(`admin login failed: ${res.status} ${await res.text()}`);
  }
  const parsed = (await res.json()) as {
    token: string;
    user: { id: string };
  };
  return {
    email: 'admin@example.com',
    password,
    id: parsed.user.id,
    token: parsed.token,
  };
}

export async function readAdminCreds(): Promise<AepbaseAdminCreds> {
  const { credsFile } = getTestDirs();
  const fs = await import('fs/promises');
  return JSON.parse(await fs.readFile(credsFile, 'utf8'));
}

export async function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    httpGet(`${getAepbaseUrl()}/openapi.json`, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}
