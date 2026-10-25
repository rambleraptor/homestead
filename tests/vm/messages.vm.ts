/**
 * Household messages (`users/{id}/notifications:send`), on the VM tier: one
 * member messages another, through the inbox's "New message" and through the
 * API directly, and every rule the API holds — who may send, to whom, what,
 * and how often.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { resetMessageSlots, RATE_LIMIT } from '@rambleraptor/homestead-core/server/messages';
import { NotificationsPage } from '../e2e/pages/NotificationsPage';
import { createUser, e2eClient } from '../e2e/utils/aepbase-helpers';
import { getAepbaseUrl } from '../e2e/config/aepbase.setup';

const APP = () => process.env.HOMESTEAD_E2E_APP_URL!;

interface InboxRow {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  from_user?: string;
  url?: string;
}

describe('Household messages', () => {
  let h: Harness;

  beforeEach(async () => {
    resetMessageSlots();
    h = await bootHomestead();
  });

  afterEach(async () => {
    await h.close();
  });

  /** POST a message to `to` as the holder of `token`. */
  function send(token: string, to: string, message: unknown): Promise<Response> {
    return fetch(`${APP()}/api/aep/users/${to}/notifications:send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(message),
    });
  }

  const inbox = (userId: string, token: string) =>
    e2eClient(token).collection('users').record(userId).collection<InboxRow>('notifications').listAll();

  test('"New message" lands in the recipient\'s inbox, from the sender', async () => {
    await h.loginAs(h.member);
    const page = new NotificationsPage(h.driver);
    await page.goto();
    await page.sendMessage({ to: 'Sam', title: 'Running late', body: 'Be there by 6:30' });

    const sam = h.householdMember;
    const [row] = await inbox(sam.id, sam.token);
    expect(row).toMatchObject({
      title: 'Running late',
      message: 'Be there by 6:30',
      notification_type: 'message',
      from_user: `users/${h.member.id}`,
    });

    await h.loginAs(sam);
    await page.goto();
    await h.driver.expect(page.sender(row!.id)).toHaveText('From VM Member');
  });

  test('the API sends with a link, and says where the message went', async () => {
    const sam = h.householdMember;
    const res = await send(h.member.token, sam.id, { title: 'Milk?', url: '/groceries' });
    expect(res.status).toBe(200);
    const result = (await res.json()) as { notification: string; delivered: number };
    const [row] = await inbox(sam.id, sam.token);
    expect(result).toEqual({ notification: `users/${sam.id}/notifications/${row!.id}`, delivered: 0, failed: 0 });
    expect(row!.url).toBe('/groceries');
  });

  test('refuses what a message may not be', async () => {
    const sam = h.householdMember.id;
    const t = h.member.token;
    expect((await send(t, sam, {})).status).toBe(400);
    expect((await send(t, sam, { title: 'x'.repeat(81) })).status).toBe(400);
    expect((await send(t, sam, { title: 'hi', body: 'x'.repeat(501) })).status).toBe(400);
    for (const url of ['https://evil.example', '//evil.example', 'javascript:alert(1)']) {
      expect((await send(t, sam, { title: 'hi', url })).status).toBe(400);
    }
    expect(await inbox(sam, h.householdMember.token)).toEqual([]);
  });

  test('only between household members', async () => {
    const email = `guest-${Date.now()}@example.com`;
    const password = 'guest-vm-password';
    const guest = await createUser(h.admin.token, { email, password, display_name: 'Guest', noRole: true });
    const login = await fetch(`${getAepbaseUrl()}/users/:login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const guestToken = ((await login.json()) as { token: string }).token;

    expect((await send(h.member.token, guest.id, { title: 'hi' })).status).toBe(404);
    expect((await send(guestToken, h.member.id, { title: 'hi' })).status).toBe(403);
  });

  test('a personal access token sends only when it was granted notifications', async () => {
    const mint = async (scopes: unknown[]) => {
      const res = await fetch(`${APP()}/api/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${h.member.token}` },
        body: JSON.stringify({ name: `script ${scopes.length}`, scopes }),
      });
      expect(res.status).toBe(201);
      return ((await res.json()) as { token: string }).token;
    };
    const readOnly = await mint([{ capability: 'read', target_scope: 'collection', resource_type: 'notification' }]);
    const sender = await mint([{ capability: 'write', target_scope: 'collection', resource_type: 'notification' }]);

    expect((await send(readOnly, h.householdMember.id, { title: 'hi' })).status).toBe(403);
    expect((await send(sender, h.householdMember.id, { title: 'hi' })).status).toBe(200);
  });

  test(`at most ${RATE_LIMIT} an hour per sender; a refused message doesn't count`, async () => {
    const sam = h.householdMember.id;
    expect((await send(h.member.token, sam, { title: '' })).status).toBe(400);
    for (let i = 0; i < RATE_LIMIT; i++) {
      expect((await send(h.member.token, sam, { title: `#${i}` })).status).toBe(200);
    }
    const limited = await send(h.member.token, sam, { title: 'one more' });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Another sender has their own allowance.
    expect((await send(h.householdMember.token, h.member.id, { title: 'hi' })).status).toBe(200);
  });
});
