/**
 * The superuser Credentials app, on the VM tier: a superuser adds, lists,
 * replaces, renames and deletes credentials, and never sees a value back —
 * only "Set · …hint · date". What the UI wrote is checked on the server with
 * `readCredential`, the in-process reader server code uses. Members can't reach
 * the collection at all (`access: { model: 'superusers' }`).
 *
 * The VM server runs with a test master key (vitest.config.ts), as an instance
 * set up with one would.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { readCredential } from '@rambleraptor/homestead-core/server/credentials';
import { CredentialsPage } from '../e2e/pages/CredentialsPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';

interface CredentialRecord {
  id: string;
  name: string;
  value: { $secret: true; set: boolean; hint?: string };
}

const API_KEY = 'sk-live-0123456789abcdef3f9a';

describe('Credentials', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
  });

  afterEach(async () => {
    await h.close();
  });

  const credentialsAs = (token: string) => e2eClient(token).collection<CredentialRecord>('credentials');

  async function onlyCredential(): Promise<CredentialRecord> {
    const all = await credentialsAs(h.admin.token).listAll();
    expect(all).toHaveLength(1);
    return all[0]!;
  }

  test('a superuser adds a credential and sees it set, never its value', async () => {
    await h.loginAs(h.admin);
    const page = new CredentialsPage(h.driver);
    await page.goto();
    await h.driver.expect(page.emptyState).toBeVisible();

    await page.add('OpenAI API key', API_KEY, 'For the assistant');
    const created = await onlyCredential();

    await h.driver.expect(page.credential(created.id)).toContainText('OpenAI API key');
    await h.driver.expect(page.credential(created.id)).toContainText('For the assistant');
    await h.driver.expect(page.valueSummary(created.id)).toContainText('Set · …3f9a');
    await h.driver.expect(page.list).not.toContainText(API_KEY);

    // The API hands back a descriptor; only server code gets the value.
    expect(created.value).toMatchObject({ $secret: true, set: true, hint: '…3f9a' });
    expect(JSON.stringify(created)).not.toContain(API_KEY);
    expect(readCredential(created.id)).toBe(API_KEY);
  });

  test('replacing the value rotates it; renaming leaves it alone', async () => {
    const created = await credentialsAs(h.admin.token).create({
      name: 'Home Assistant',
      value: 'ha-token-aaaaaaaaaaaaaaaa1111',
    });
    await h.loginAs(h.admin);
    const page = new CredentialsPage(h.driver);
    await page.goto();
    await h.driver.expect(page.valueSummary(created.id)).toContainText('…1111');

    await page.replaceValue(created.id, 'ha-token-bbbbbbbbbbbbbbbb2222');
    await h.driver.expect(page.valueSummary(created.id)).toContainText('…2222');
    expect(readCredential(created.id)).toBe('ha-token-bbbbbbbbbbbbbbbb2222');

    await page.rename(created.id, 'Home Assistant (garage)');
    await h.driver.expect(page.credential(created.id)).toContainText('Home Assistant (garage)');
    expect(readCredential(created.id)).toBe('ha-token-bbbbbbbbbbbbbbbb2222');
  });

  test('a superuser deletes a credential', async () => {
    const created = await credentialsAs(h.admin.token).create({ name: 'Old key', value: 'x'.repeat(20) });
    await h.loginAs(h.admin);
    const page = new CredentialsPage(h.driver);
    await page.goto();
    await page.delete(created.id);
    await h.driver.expect(page.emptyState).toBeVisible();
    expect(readCredential(created.id)).toBeNull();
  });

  test('members can neither list nor add credentials', async () => {
    await credentialsAs(h.admin.token).create({ name: 'AI', value: API_KEY });
    const asMember = credentialsAs(h.member.token);

    // No household grant: a member sees only rows they own, and can't own one.
    expect(await asMember.listAll()).toEqual([]);

    await expect(asMember.create({ name: 'Mine', value: 'y'.repeat(20) })).rejects.toMatchObject({
      code: 403,
    });
  });
});
