/**
 * Gift cards in the offline cache, on the VM tier.
 *
 * The cache saved on the device must keep a card (so the list opens offline)
 * but never its number or PIN — those are encrypted on the server and stay in
 * memory only. The VM's DOM has no IndexedDB, so the persister falls back to
 * localStorage under the same key, which is what this reads.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { PERSISTER_STORAGE_KEY } from '@rambleraptor/homestead-core/api/persistQueryClient';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

/** What the browser does when the person switches to another app. */
function hideApp(): void {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('Gift cards — offline cache', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
    await h.loginAs(h.member);
  });

  afterEach(async () => {
    // Back to the document's own visibility.
    delete (document as { visibilityState?: unknown }).visibilityState;
    await h.close();
  });

  test('saves the card to the device without its number or PIN', async () => {
    await e2eClient(h.member.token).collection('gift-cards').create({
      merchant: 'Cached Coffee',
      amount: 25,
      card_number: '6011-0009-9013-9424',
      pin: '8642',
    });

    await h.driver.goto('/gift-cards');
    await h.driver.expect(h.driver.getByText('Cached Coffee').first()).toBeVisible();

    // Switch away from the app: the cache saves now, not after its throttle.
    hideApp();
    const saved = await vi.waitFor(
      () => {
        const snapshot = window.localStorage.getItem(PERSISTER_STORAGE_KEY) ?? '';
        expect(snapshot).toContain('Cached Coffee');
        return snapshot;
      },
      { timeout: 1500, interval: 50 },
    );
    expect(saved).not.toContain('6011-0009-9013-9424');
    expect(saved).not.toContain('8642');
  });
});
