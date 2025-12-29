/**
 * PocketBase Test Instance Setup
 *
 * Manages a test instance of PocketBase for e2e tests
 */

import { spawn, ChildProcess } from 'child_process';
import { existsSync, cpSync, createWriteStream } from 'fs';
import { mkdir, rm, chmod } from 'fs/promises';
import { join } from 'path';
import { get as httpsGet } from 'https';
import { get as httpGet, request as httpRequest } from 'http';

const POCKETBASE_VERSION = '0.34.2';
const TEST_PORT = 8092; // Different from dev (8090) and migration tests (8091)

let pbProcess: ChildProcess | null = null;

/**
 * Get project root directory
 */
export function getProjectRoot(): string {
  // When running from tests/e2e, go up 2 levels to reach project root
  return join(process.cwd(), '../..');
}

/**
 * Get test directories
 */
export function getTestDirs() {
  const e2eDir = process.cwd(); // We're already in tests/e2e when running
  return {
    e2eDir,
    pbDataDir: join(e2eDir, 'pb_test_data'),
    migrationsSource: join(getProjectRoot(), 'pb_migrations'),
    hooksSource: join(getProjectRoot(), 'pb_hooks'),
  };
}

/**
 * Get the appropriate HTTP/HTTPS module based on URL protocol
 */
function getHttpModule(url: string) {
  return url.startsWith('https://') ? httpsGet : httpGet;
}

/**
 * Detect OS and architecture to download correct PocketBase binary
 */
function getPocketBaseDownloadUrl(): string {
  const platform = process.platform;
  const arch = process.arch;

  let os: string, archSuffix: string;

  if (platform === 'darwin') os = 'darwin';
  else if (platform === 'linux') os = 'linux';
  else if (platform === 'win32') os = 'windows';
  else throw new Error(`Unsupported platform: ${platform}`);

  if (arch === 'x64') archSuffix = 'amd64';
  else if (arch === 'arm64') archSuffix = 'arm64';
  else throw new Error(`Unsupported architecture: ${arch}`);

  return `https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_${os}_${archSuffix}.zip`;
}

/**
 * Download a file from URL
 */
async function downloadFile(url: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destination);
    const get = getHttpModule(url);

    get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        return downloadFile(response.headers.location!, destination)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Extract zip file
 */
async function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const unzip = spawn('unzip', ['-o', zipPath, '-d', destDir]);

    unzip.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Extraction failed with code ${code}`));
      }
    });

    unzip.on('error', reject);
  });
}

/**
 * Setup PocketBase for e2e testing
 */
export async function setupPocketBase(): Promise<void> {
  const { e2eDir, pbDataDir, migrationsSource } = getTestDirs();

  // Clean up any previous test data
  if (existsSync(pbDataDir)) {
    await rm(pbDataDir, { recursive: true, force: true });
  }

  // Download PocketBase if not already present
  const pbZip = join(e2eDir, 'pocketbase.zip');
  const pbBinary = join(e2eDir, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');

  if (!existsSync(pbBinary)) {
    const downloadUrl = getPocketBaseDownloadUrl();
    await downloadFile(downloadUrl, pbZip);
    await extractZip(pbZip, e2eDir);

    // Make executable (Unix-like systems)
    if (process.platform !== 'win32') {
      await chmod(pbBinary, 0o755);
    }
  }

  // Create data directory and copy migrations
  await mkdir(pbDataDir, { recursive: true });
  const migrationsDir = join(pbDataDir, 'pb_migrations');

  console.log(`📦 Copying migrations from ${migrationsSource} to ${migrationsDir}`);
  cpSync(migrationsSource, migrationsDir, { recursive: true });

  // Verify migrations were copied
  const fs = await import('fs');
  const migrationsFiles = fs.readdirSync(migrationsDir);
  console.log(`   Found ${migrationsFiles.length} migration files:`, migrationsFiles.filter(f => f.endsWith('.js')).join(', '));

  // Copy hooks directory
  const hooksSource = join(getProjectRoot(), 'pb_hooks');
  const hooksDir = join(pbDataDir, 'pb_hooks');

  console.log(`🪝 Copying hooks from ${hooksSource} to ${hooksDir}`);
  cpSync(hooksSource, hooksDir, { recursive: true });

  // Verify hooks were copied
  const hooksFiles = fs.readdirSync(hooksDir);
  console.log(`   Found ${hooksFiles.length} hook files:`, hooksFiles.filter(f => f.endsWith('.pb.js')).join(', '));

  // Create admin user FIRST (this initializes the database)
  await createAdminUser();

  // Run migrations AFTER database is initialized
  await runMigrations();
}

/**
 * Create admin user using PocketBase CLI
 */
async function createAdminUser(): Promise<void> {
  const { e2eDir, pbDataDir } = getTestDirs();

  return new Promise((resolve, reject) => {
    const pbBinary = join(e2eDir, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');

    console.log(`👤 Creating admin user with binary: ${pbBinary}`);
    console.log(`   Data directory: ${pbDataDir}`);

    const adminProcess = spawn(pbBinary, [
      'superuser',
      'upsert',
      'admin@test.local',
      'TestAdmin123!',
      '--dir', pbDataDir
    ]);

    let output = '';

    adminProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(`   [stdout] ${text.trim()}`);
    });

    adminProcess.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(`   [stderr] ${text.trim()}`);
    });

    adminProcess.on('close', (code) => {
      console.log(`   Admin creation exited with code: ${code}`);
      if (code === 0 || output.includes('Successfully')) {
        console.log('✅ Admin user created successfully\n');
        resolve();
      } else {
        console.error('❌ Admin creation failed\n');
        reject(new Error(`Failed to create admin (exit code ${code}): ${output}`));
      }
    });

    adminProcess.on('error', (err) => {
      console.error('❌ Failed to spawn admin creation process\n');
      reject(new Error(`Failed to spawn admin creation: ${err.message}`));
    });
  });
}

/**
 * Run migrations explicitly using PocketBase CLI
 */
async function runMigrations(): Promise<void> {
  const { e2eDir, pbDataDir } = getTestDirs();

  return new Promise((resolve, reject) => {
    const pbBinary = join(e2eDir, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
    const migrationsDir = join(pbDataDir, 'pb_migrations');

    console.log(`🔄 Running migrations with binary: ${pbBinary}`);
    console.log(`   Data directory: ${pbDataDir}`);
    console.log(`   Migrations directory: ${migrationsDir}`);

    const migrateProcess = spawn(pbBinary, [
      'migrate',
      '--dir', pbDataDir,
      '--migrationsDir', migrationsDir
    ]);

    let output = '';

    migrateProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(`   [stdout] ${text.trim()}`);
    });

    migrateProcess.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(`   [stderr] ${text.trim()}`);
    });

    migrateProcess.on('close', (code) => {
      console.log(`   Migration process exited with code: ${code}`);
      if (code === 0) {
        console.log('✅ Migrations completed successfully\n');
        resolve();
      } else {
        console.error('❌ Migrations failed\n');
        console.error(`   Output: ${output}`);
        reject(new Error(`Failed to run migrations (exit code ${code}): ${output}`));
      }
    });

    migrateProcess.on('error', (err) => {
      console.error('❌ Failed to spawn migration process\n');
      reject(new Error(`Failed to spawn migrations: ${err.message}`));
    });
  });
}

/**
 * Start PocketBase server
 */
export async function startPocketBase(): Promise<void> {
  const { e2eDir, pbDataDir } = getTestDirs();

  return new Promise((resolve, reject) => {
    const pbBinary = join(e2eDir, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');

    pbProcess = spawn(pbBinary, [
      'serve',
      '--dir', pbDataDir,
      '--http', `127.0.0.1:${TEST_PORT}`,
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    let ready = false;

    pbProcess.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Log all PocketBase output to help debug migration issues
      console.log('[PocketBase]', text.trim());

      if (text.includes('Server started') || text.includes(`http://127.0.0.1:${TEST_PORT}`)) {
        ready = true;
        setTimeout(() => resolve(), 1000);
      }
    });

    pbProcess.stderr?.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Log errors/warnings from PocketBase
      console.error('[PocketBase ERROR]', text.trim());
    });

    pbProcess.on('error', (err) => {
      reject(new Error(`Failed to start PocketBase: ${err.message}`));
    });

    pbProcess.on('close', (code) => {
      if (!ready) {
        reject(new Error(`PocketBase exited early with code ${code}\n\nOutput:\n${output}`));
      }
    });

    setTimeout(() => {
      if (!ready) {
        pbProcess?.kill();
        reject(new Error('PocketBase did not start within 10 seconds'));
      }
    }, 10000);
  });
}

/**
 * Stop PocketBase server
 */
export async function stopPocketBase(): Promise<void> {
  if (pbProcess) {
    pbProcess.kill();
    await new Promise(resolve => setTimeout(resolve, 1000));
    pbProcess = null;
  }
}

/**
 * Get PocketBase base URL
 */
export function getPocketBaseUrl(): string {
  return `http://127.0.0.1:${TEST_PORT}`;
}

/**
 * Check PocketBase health
 */
export async function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const url = `${getPocketBaseUrl()}/api/health`;
    const get = getHttpModule(url);

    get(url, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Authenticate as admin
 */
export async function authenticateAdmin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      identity: 'admin@test.local',
      password: 'TestAdmin123!'
    });

    const options = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/admins/auth-with-password',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = httpRequest(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const auth = JSON.parse(data);
            resolve(auth.token);
          } catch (e) {
            reject(new Error('Failed to parse auth response'));
          }
        } else {
          reject(new Error(`Authentication failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
