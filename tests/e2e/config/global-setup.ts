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

  // Check PocketBase health endpoint
  console.log('🏥 Checking PocketBase health...\n');
  const pbUrl = getPocketBaseUrl();
  try {
    const healthResponse = await fetch(`${pbUrl}/api/health`);
    if (healthResponse.ok) {
      console.log('✅ PocketBase health check passed\n');
    } else {
      console.warn(`⚠️  Health check returned ${healthResponse.status}\n`);
    }
  } catch (error) {
    console.error('❌ Health check failed:', error);
  }

  // Verify admin authentication works
  console.log('🔐 Verifying admin authentication...\n');
  const pb = new PocketBase(pbUrl);

  try {
    // Try to authenticate as admin
    const authData = await pb.admins.authWithPassword('admin@test.local', 'TestAdmin123!');
    console.log('✅ Admin authentication successful\n');
    console.log(`   Admin ID: ${authData.admin?.id}\n`);
    pb.authStore.clear();
  } catch (error: any) {
    console.error('❌ Admin authentication failed:', error);
    console.error(`   Endpoint: ${pbUrl}/api/admins/auth-with-password`);
    console.error(`   Status: ${error.status}`);
    console.error(`   Message: ${error.message}\n`);

    // Try to list available API routes for debugging
    console.log('🔍 Attempting to check PocketBase API...\n');
    try {
      const apiResponse = await fetch(`${pbUrl}/api/`);
      console.log(`   API root status: ${apiResponse.status}\n`);
    } catch (e) {
      console.log('   Could not reach API root\n');
    }

    throw new Error('Failed to authenticate admin user. Tests cannot proceed.');
  }

  console.log(`✅ PocketBase started at ${getPocketBaseUrl()}\n`);
}

export default globalSetup;
