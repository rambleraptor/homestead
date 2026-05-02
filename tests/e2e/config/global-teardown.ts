/**
 * Playwright Global Teardown
 *
 * Stops the dev server and aepbase processes spawned in global-setup.
 * The data directory is left in place so a test failure can be
 * inspected post-run.
 */

import { stopAepbase } from './aepbase.setup';
import { stopDevServer } from './dev-server.setup';

async function globalTeardown() {
  console.log('\n🛑 Stopping dev server...');
  await stopDevServer();
  console.log('🛑 Stopping aepbase...');
  await stopAepbase();
}

export default globalTeardown;
