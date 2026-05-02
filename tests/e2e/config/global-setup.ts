/**
 * Playwright Global Setup
 *
 * Runs once before all tests. Spawns a dedicated aepbase instance,
 * captures the bootstrap superuser credentials, then starts the Next.js
 * dev server with those creds — its instrumentation hook applies the
 * resource-definition + module-flag schema as part of normal boot, so
 * there's no separate apply step.
 */

import { startAepbase, getAepbaseUrl } from './aepbase.setup';
import { startDevServer, getDevServerUrl } from './dev-server.setup';

async function globalSetup() {
  console.log('\n🔧 Setting up aepbase for e2e tests...\n');

  const creds = await startAepbase();
  console.log(`✅ aepbase running at ${getAepbaseUrl()}`);
  console.log(`   Admin: ${creds.email}`);

  console.log('🚀 Starting Next.js dev server...');
  await startDevServer(creds);
  console.log(`✅ Dev server ready at ${getDevServerUrl()} (schema applied)\n`);
}

export default globalSetup;
