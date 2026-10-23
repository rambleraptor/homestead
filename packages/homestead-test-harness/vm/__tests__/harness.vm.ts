/**
 * The harness's own contract: what `bootHomestead()` and the VM driver promise
 * every spec, checked against the real app.
 */

import { describe, expect, test } from 'vitest';
import { PERSISTER_STORAGE_KEY } from '@rambleraptor/homestead-core/api/persistQueryClient';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { bootHomestead } from '../boot';

async function poll(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('bootHomestead', () => {
  test('loginAs installs a session and lands on the dashboard', async () => {
    const h = await bootHomestead();
    try {
      const session = await h.loginAs(h.member);
      expect(session.id).toBe(h.member.id);
      expect(window.location.pathname).toBe('/dashboard');
      const me = await serverClient(session.token).collection<{ email: string }>('users').get('me');
      expect(me.email).toBe(h.member.email);
    } finally {
      await h.close();
    }
  });

  test('loginAs via the form signs in through the real login page', async () => {
    const h = await bootHomestead();
    try {
      await h.driver.expect(h.driver.getByLabel(/email/i)).toBeVisible();
      await h.loginAs(h.admin, { via: 'form' });
      await h.driver.expect(h.driver.getByTestId('app-shell')).toBeVisible();
    } finally {
      await h.close();
    }
  });

  test('goto loads the page like a browser: the session survives, the URL changes', async () => {
    const h = await bootHomestead();
    try {
      await h.loginAs(h.admin);
      await h.driver.goto('/superuser/users');
      await h.driver.expectURL(/\/superuser\/users$/);
      await h.driver.expect(h.driver.getByTestId('app-shell')).toBeVisible();
    } finally {
      await h.close();
    }
  });

  test('every boot starts from a fresh copy of the template database', async () => {
    const email = `harness-${Date.now()}@example.com`;
    const first = await bootHomestead();
    try {
      await serverClient(first.admin.token)
        .collection('users')
        .create({ email, password: 'password123', type: 'regular' });
    } finally {
      await first.close();
    }

    const second = await bootHomestead();
    try {
      const users = await serverClient(second.admin.token).collection<{ email: string }>('users').listAll();
      expect(users.map((u) => u.email)).not.toContain(email);
      expect(users.map((u) => u.email)).toEqual(expect.arrayContaining([second.admin.email, second.member.email]));
    } finally {
      await second.close();
    }
  });

  test('requests to any other origin are blocked', async () => {
    const h = await bootHomestead();
    try {
      await expect(fetch('https://example.com/')).rejects.toThrow(/blocked network request/);
    } finally {
      await h.close();
    }
  });

  test('the change feed the page opens is torn down with it', async () => {
    const h = await bootHomestead();
    const feed = h.app.changeFeed;
    try {
      await h.loginAs(h.member);
      await poll(() => feed.size() === 1, 'the page to subscribe to /api/events');
    } finally {
      await h.close();
    }
    await poll(() => feed.size() === 0, 'the subscription to close');
  });

  test("a test's pending cache save never lands in the next test's storage", async () => {
    const first = await bootHomestead();
    try {
      await first.loginAs(first.member);
      await serverClient(first.member.token)
        .collection('gift-cards')
        .create({ merchant: 'Leaky Merchant', amount: 10, card_number: '1' });
      await first.driver.goto('/gift-cards');
      await first.driver.expect(first.driver.getByText('Leaky Merchant').first()).toBeVisible();
    } finally {
      await first.close();
    }

    const second = await bootHomestead();
    try {
      // Outlast the persister's 2s save throttle.
      await new Promise((r) => setTimeout(r, 2500));
      expect(window.localStorage.getItem(PERSISTER_STORAGE_KEY) ?? '').not.toContain('Leaky Merchant');
    } finally {
      await second.close();
    }
  });
});
