#!/usr/bin/env node
/**
 * Standalone script to test PocketBase fixtures without Playwright
 * Run with: node test-fixture-standalone.js
 */

import PocketBase from 'pocketbase';

const POCKETBASE_URL = 'http://127.0.0.1:8092';

async function testFixture() {
  console.log('🧪 Testing PocketBase fixture logic...\n');

  const pb = new PocketBase(POCKETBASE_URL);

  try {
    // Step 1: Check if PocketBase is running
    console.log('1️⃣ Checking PocketBase health...');
    const healthResponse = await fetch(`${POCKETBASE_URL}/api/health`);
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status}`);
    }
    console.log('   ✅ PocketBase is running\n');

    // Step 2: Authenticate as admin using new API
    console.log('2️⃣ Authenticating as admin...');
    try {
      const authData = await pb.collection('_superusers').authWithPassword('admin@test.local', 'TestAdmin123!');
      console.log('   ✅ Admin authentication successful');
      console.log(`   Admin ID: ${authData.record?.id}`);
      console.log(`   Auth token: ${pb.authStore.token?.substring(0, 20)}...`);
      console.log(`   Is valid: ${pb.authStore.isValid}\n`);
    } catch (error) {
      console.error('   ❌ Admin authentication failed:', error);
      throw error;
    }

    // Step 3: Check users collection exists
    console.log('3️⃣ Checking users collection...');
    try {
      const collections = await pb.collections.getFullList();
      const usersCollection = collections.find(c => c.name === 'users');
      if (usersCollection) {
        console.log('   ✅ Users collection exists');
        console.log(`   Collection ID: ${usersCollection.id}`);
        console.log(`   Collection type: ${usersCollection.type}\n`);
      } else {
        console.log('   ⚠️  Users collection not found\n');
      }
    } catch (error) {
      console.log('   ⚠️  Could not list collections:', error.message, '\n');
    }

    // Step 4: Check existing users
    console.log('4️⃣ Checking existing users...');
    try {
      const existingUsers = await pb.collection('users').getFullList();
      console.log(`   Found ${existingUsers.length} existing users`);
      existingUsers.forEach(user => {
        console.log(`   - ${user.email} (ID: ${user.id})`);
      });
      console.log('');
    } catch (error) {
      console.log('   ⚠️  Could not list users:', error.message, '\n');
    }

    // Step 5: Try to create a test user
    console.log('5️⃣ Attempting to create test user...');
    const testEmail = `test-${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';

    try {
      const newUser = await pb.collection('users').create({
        email: testEmail,
        password: testPassword,
        passwordConfirm: testPassword,
        name: 'Test User',
      });
      console.log('   ✅ User created successfully!');
      console.log(`   User ID: ${newUser.id}`);
      console.log(`   Email: ${newUser.email}\n`);

      // Step 6: Try to authenticate as the new user
      console.log('6️⃣ Attempting to authenticate as new user...');
      pb.authStore.clear();
      const userAuth = await pb.collection('users').authWithPassword(testEmail, testPassword);
      console.log('   ✅ User authentication successful!');
      console.log(`   User ID: ${userAuth.record?.id}`);
      console.log(`   Auth token: ${pb.authStore.token?.substring(0, 20)}...\n`);

      // Step 7: Clean up - re-auth as admin and delete test user
      console.log('7️⃣ Cleaning up test user...');
      await pb.collection('_superusers').authWithPassword('admin@test.local', 'TestAdmin123!');
      await pb.collection('users').delete(newUser.id);
      console.log('   ✅ Test user deleted\n');

    } catch (error) {
      console.error('   ❌ User creation/auth failed:', error);
      console.error('   Status:', error.status);
      console.error('   Data:', error.data);
      console.error('   Message:', error.message);

      if (error.data?.data) {
        console.error('   Validation errors:');
        Object.entries(error.data.data).forEach(([field, err]) => {
          console.error(`     - ${field}:`, err);
        });
      }
      throw error;
    }

    console.log('✅ All fixture tests passed!\n');
    pb.authStore.clear();

  } catch (error) {
    console.error('\n❌ Fixture test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testFixture().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
