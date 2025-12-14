#!/usr/bin/env node

/**
 * PocketBase Migration Test Suite
 *
 * This script tests that all PocketBase migrations work correctly by:
 * 1. Downloading PocketBase 0.34.2
 * 2. Running it with our migrations
 * 3. Verifying PocketBase starts successfully
 * 4. Checking that expected collections are created
 */

import { spawn } from 'child_process';
import { createWriteStream, existsSync, cpSync } from 'fs';
import { mkdir, rm, chmod, readdir } from 'fs/promises';
import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const POCKETBASE_VERSION = '0.34.2';
const TEST_DIR = __dirname;
const PB_DATA_DIR = join(TEST_DIR, 'test_pb_data');
const MIGRATIONS_SOURCE = join(TEST_DIR, '../../pb_migrations');
const TEST_PORT = 8091; // Different from default to avoid conflicts

/**
 * Get the appropriate HTTP/HTTPS module based on URL protocol
 */
function getHttpModule(url) {
  return url.startsWith('https://') ? httpsGet : httpGet;
}

/**
 * Detect OS and architecture to download correct PocketBase binary
 */
function getPocketBaseDownloadUrl() {
  const platform = process.platform;
  const arch = process.arch;

  let os, archSuffix;

  if (platform === 'darwin') os = 'darwin';
  else if (platform === 'linux') os = 'linux';
  else if (platform === 'win32') os = 'windows';
  else throw new Error(`Unsupported platform: ${platform}`);

  if (arch === 'x64') archSuffix = 'amd64';
  else if (arch === 'arm64') archSuffix = 'arm64';
  else throw new Error(`Unsupported architecture: ${arch}`);

  const ext = os === 'windows' ? 'zip' : 'zip';
  return `https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_${os}_${archSuffix}.${ext}`;
}

/**
 * Download a file from URL
 */
async function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading from ${url}...`);
    const file = createWriteStream(destination);
    const get = getHttpModule(url);

    get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, destination)
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
        console.log('✓ Download complete');
        resolve();
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Extract zip file (cross-platform)
 */
async function extractZip(zipPath, destDir) {
  console.log(`📦 Extracting ${zipPath}...`);

  // Use unzip command which is commonly available
  return new Promise((resolve, reject) => {
    const unzip = spawn('unzip', ['-o', zipPath, '-d', destDir]);

    unzip.on('close', (code) => {
      if (code === 0) {
        console.log('✓ Extraction complete');
        resolve();
      } else {
        reject(new Error(`Extraction failed with code ${code}`));
      }
    });

    unzip.on('error', reject);
  });
}

/**
 * Setup PocketBase for testing
 */
async function setupPocketBase() {
  console.log('\n🔧 Setting up PocketBase for testing...\n');

  // Clean up any previous test data
  if (existsSync(PB_DATA_DIR)) {
    console.log('🧹 Cleaning up previous test data...');
    await rm(PB_DATA_DIR, { recursive: true, force: true });
  }

  // Download PocketBase
  const pbZip = join(TEST_DIR, 'pocketbase.zip');
  const downloadUrl = getPocketBaseDownloadUrl();

  if (!existsSync(pbZip)) {
    await downloadFile(downloadUrl, pbZip);
  } else {
    console.log('✓ PocketBase already downloaded');
  }

  // Extract
  await extractZip(pbZip, TEST_DIR);

  // Make executable (Unix-like systems)
  if (process.platform !== 'win32') {
    const pbBinary = join(TEST_DIR, 'pocketbase');
    await chmod(pbBinary, 0o755);
    console.log('✓ Made PocketBase executable');
  }

  // Create data directory and copy migrations
  await mkdir(PB_DATA_DIR, { recursive: true });
  const migrationsDir = join(PB_DATA_DIR, 'migrations');

  console.log('📋 Copying migrations...');
  cpSync(MIGRATIONS_SOURCE, migrationsDir, { recursive: true });

  const migrationFiles = await readdir(migrationsDir);
  console.log(`✓ Copied ${migrationFiles.length} migration(s):`);
  migrationFiles.forEach(file => console.log(`  - ${file}`));
}

/**
 * Start PocketBase server and wait for it to be ready
 */
async function startPocketBase() {
  return new Promise((resolve, reject) => {
    console.log('\n🚀 Starting PocketBase...\n');

    const pbBinary = process.platform === 'win32'
      ? join(TEST_DIR, 'pocketbase.exe')
      : join(TEST_DIR, 'pocketbase');

    const pb = spawn(pbBinary, [
      'serve',
      '--dir', PB_DATA_DIR,
      '--http', `127.0.0.1:${TEST_PORT}`,
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    let ready = false;

    // Capture stdout
    pb.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(text.trim());

      // Check if server is ready
      if (text.includes('Server started') || text.includes(`http://127.0.0.1:${TEST_PORT}`)) {
        ready = true;
        // Give it a moment to fully initialize
        setTimeout(() => resolve(pb), 1000);
      }
    });

    // Capture stderr
    pb.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.error(text.trim());
    });

    // Handle errors
    pb.on('error', (err) => {
      reject(new Error(`Failed to start PocketBase: ${err.message}`));
    });

    pb.on('close', (code) => {
      if (!ready) {
        reject(new Error(`PocketBase exited early with code ${code}\n\nOutput:\n${output}`));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!ready) {
        pb.kill();
        reject(new Error('PocketBase did not start within 10 seconds'));
      }
    }, 10000);
  });
}

/**
 * Check PocketBase health via HTTP
 */
async function checkHealth() {
  return new Promise((resolve, reject) => {
    console.log('\n🏥 Checking PocketBase health...\n');
    const url = `http://127.0.0.1:${TEST_PORT}/api/health`;
    const get = getHttpModule(url);

    get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✓ Health check passed');
          try {
            const health = JSON.parse(data);
            console.log(`  Status: ${health.message || 'OK'}`);
            resolve(health);
          } catch (e) {
            resolve({ status: 'ok' });
          }
        } else {
          reject(new Error(`Health check failed: ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Create admin user and authenticate
 */
async function createAdminAndAuth() {
  return new Promise((resolve, reject) => {
    console.log('\n👤 Creating admin user and authenticating...\n');

    const http = require('http');
    const postData = JSON.stringify({
      email: 'test@test.com',
      password: 'test1234test1234',
      passwordConfirm: 'test1234test1234'
    });

    const options = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/admins',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 400) {
          // 400 might mean admin already exists, which is fine
          // Now authenticate
          authenticateAdmin().then(resolve).catch(reject);
        } else {
          reject(new Error(`Failed to create admin: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Authenticate as admin and get token
 */
async function authenticateAdmin() {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const postData = JSON.stringify({
      identity: 'test@test.com',
      password: 'test1234test1234'
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

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const auth = JSON.parse(data);
            console.log('✓ Admin authenticated successfully');
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

/**
 * Verify collections were created by migrations
 */
async function verifyCollections(authToken) {
  return new Promise((resolve, reject) => {
    console.log('\n📊 Verifying collections...\n');
    const http = require('http');

    const options = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/collections',
      method: 'GET',
      headers: {
        'Authorization': authToken
      }
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            const collections = response.items || [];

            console.log(`✓ Found ${collections.length} collection(s):`);
            collections.forEach(col => {
              console.log(`  - ${col.name} (${col.type})`);
            });

            // Check for expected collections based on migrations
            const expectedCollections = ['users', 'gift_cards'];
            const collectionNames = collections.map(c => c.name);

            const missing = expectedCollections.filter(name =>
              !collectionNames.includes(name)
            );

            if (missing.length > 0) {
              reject(new Error(`Missing expected collections: ${missing.join(', ')}`));
            } else {
              console.log('\n✓ All expected collections exist');

              // Check gift_cards collection schema
              const giftCards = collections.find(c => c.name === 'gift_cards');
              if (giftCards) {
                const fieldNames = giftCards.fields.map(f => f.name);
                console.log(`\n  gift_cards fields: ${fieldNames.join(', ')}`);

                const expectedFields = ['merchant', 'card_number', 'pin', 'amount', 'notes', 'created_by'];
                const missingFields = expectedFields.filter(f => !fieldNames.includes(f));

                if (missingFields.length > 0) {
                  reject(new Error(`gift_cards collection missing fields: ${missingFields.join(', ')}`));
                } else {
                  console.log('  ✓ All expected fields present');
                }
              }

              resolve(collections);
            }
          } catch (e) {
            reject(new Error(`Failed to parse collections response: ${e.message}`));
          }
        } else {
          reject(new Error(`Failed to fetch collections: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Main test runner
 */
async function runTests() {
  let pbProcess = null;

  try {
    console.log('🧪 PocketBase Migration Test Suite\n');
    console.log(`   Version: ${POCKETBASE_VERSION}`);
    console.log(`   Platform: ${process.platform} ${process.arch}\n`);
    console.log('='.repeat(50));

    // Setup
    await setupPocketBase();

    // Start PocketBase
    pbProcess = await startPocketBase();

    // Wait a bit for migrations to apply
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Run checks
    await checkHealth();
    const authToken = await createAdminAndAuth();
    await verifyCollections(authToken);

    // Success!
    console.log('\n' + '='.repeat(50));
    console.log('\n✅ All migration tests passed!\n');

    // Cleanup
    if (pbProcess) {
      console.log('🛑 Stopping PocketBase...');
      pbProcess.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    process.exit(0);

  } catch (error) {
    console.error('\n' + '='.repeat(50));
    console.error('\n❌ Migration tests failed:\n');
    console.error(error.message);
    console.error('\n' + '='.repeat(50) + '\n');

    if (pbProcess) {
      pbProcess.kill();
    }

    process.exit(1);
  }
}

// Run tests
runTests();
