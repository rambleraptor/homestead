/**
 * Playwright Global Setup
 *
 * Runs once before all tests
 */

import { setupPocketBase, startPocketBase, getPocketBaseUrl } from './pocketbase.setup';
import PocketBase from 'pocketbase';

async function globalSetup() {
  console.log('\n🔧 Setting up PocketBase for e2e tests...\n');

  await setupPocketBase();
  await startPocketBase();

  // Wait for PocketBase to be fully ready
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Verify admin authentication works
  console.log('🔐 Verifying admin authentication...\n');
  const pb = new PocketBase(getPocketBaseUrl());

  try {
    await pb.admins.authWithPassword('admin@test.local', 'TestAdmin123!');
    console.log('✅ Admin authentication successful\n');
    pb.authStore.clear();
  } catch (error) {
    console.error('❌ Admin authentication failed:', error);
    throw new Error('Failed to authenticate admin user. Tests cannot proceed.');
  }

  console.log(`✅ PocketBase started at ${getPocketBaseUrl()}\n`);
}

export default globalSetup;
