/**
 * Playwright Global Setup
 *
 * Runs once before all tests. Spawns a dedicated aepbase instance,
 * captures the bootstrap superuser credentials, applies the schema, and
 * persists the admin token to disk for the per-test fixture to read.
 */

import { startAepbase, getAepbaseUrl } from './aepbase.setup';
import { applySchema } from './apply-schema';

async function globalSetup() {
  console.log('\n🔧 Setting up aepbase for e2e tests...\n');

  const creds = await startAepbase();
  console.log(`✅ aepbase running at ${getAepbaseUrl()}`);
  console.log(`   Admin: ${creds.email}`);

  console.log('📦 Applying schema...');
  await applySchema(creds.token);
  console.log('✅ Schema applied\n');
}

export default globalSetup;
