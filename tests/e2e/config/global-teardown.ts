/**
 * Playwright Global Teardown
 *
 * Stops the aepbase process that was spawned in global-setup. The data
 * directory is left in place so a test failure can be inspected post-run.
 */

import { stopAepbase } from './aepbase.setup';

async function globalTeardown() {
  console.log('\n🛑 Stopping aepbase...');
  await stopAepbase();
}

export default globalTeardown;
