/**
 * Household messages (`../messages`): the content rules, the rate limit, and
 * what a send writes and pushes — the engine faked, the seams installed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeServerClient } from './fake-server-client';

const fake = createFakeServerClient();
vi.mock('../client', () => ({ serverClient: () => fake.client }));
const push = vi.hoisted(() => ({ sendNotification: vi.fn(async () => ({})), setVapidDetails: vi.fn() }));
vi.mock('web-push', () => ({ default: push }));

import { setHouseholdDirectory } from '../household';
import { setSystemTokenIssuer } from '../system-token';
import {
  checkMessage,
  isInAppPath,
  MessageError,
  RATE_LIMIT,
  RATE_WINDOW_MS,
  resetMessageSlots,
  sendMessage,
  takeMessageSlot,
} from '../messages';

const revoke = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  resetMessageSlots();
  setHouseholdDirectory(() => [
    { id: 'u1', name: 'Alex', admin: true },
    { id: 'u2', name: 'Sam', admin: false },
  ]);
  setSystemTokenIssuer(() => ({ token: 'system', revoke }));
  fake.createFn.mockResolvedValue({ id: 'n1' });
  fake.listAllFn.mockResolvedValue([
    { id: 'd1', enabled: true, subscription_data: { endpoint: 'a' } },
    { id: 'd2', enabled: false, subscription_data: { endpoint: 'b' } },
  ]);
});

afterEach(() => {
  setHouseholdDirectory(null);
  setSystemTokenIssuer(null);
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
});

describe('checkMessage', () => {
  it('trims, and keeps an in-app link', () => {
    expect(checkMessage({ title: ' Hi ', body: ' there ', url: '/groceries?x=1' })).toEqual({
      title: 'Hi',
      body: 'there',
      url: '/groceries?x=1',
    });
  });

  it('refuses an empty title, too much text, and links off the app', () => {
    for (const input of [
      {},
      { title: '  ' },
      { title: 'x'.repeat(81) },
      { title: 'hi', body: 'x'.repeat(501) },
      { title: 'hi', body: 5 },
      { title: 'hi', url: 'https://evil.example' },
    ]) {
      expect(() => checkMessage(input)).toThrow(MessageError);
    }
  });

  it('takes only paths in this Homestead', () => {
    expect(isInAppPath('/people/p1')).toBe(true);
    for (const url of ['//evil.example', '/\\evil.example', 'javascript:x', 'groceries', '/a\nb']) {
      expect(isInAppPath(url)).toBe(false);
    }
  });
});

describe('sendMessage', () => {
  it("writes the recipient's inbox row from the sender, with a system token it then revokes", async () => {
    const result = await sendMessage({ from: 'u1', to: 'u2', title: 'Running late', body: 'By 6:30' });
    expect(result).toEqual({ notification: 'users/u2/notifications/n1', delivered: 0, failed: 0 });
    expect(fake.createFn).toHaveBeenCalledWith(
      '/users/u2/notifications',
      expect.objectContaining({
        title: 'Running late',
        message: 'By 6:30',
        notification_type: 'message',
        from_user: 'users/u1',
        url: '/notifications',
        read: false,
      }),
    );
    expect(revoke).toHaveBeenCalledOnce();
    // No VAPID keys: the inbox row is the whole delivery.
    expect(push.sendNotification).not.toHaveBeenCalled();
  });

  it("pushes to the recipient's enabled devices, titled with the sender's name", async () => {
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    const result = await sendMessage({ from: 'u1', to: 'u2', title: 'Milk?', url: '/groceries' });
    expect(result.delivered).toBe(1);
    expect(push.sendNotification).toHaveBeenCalledOnce();
    const payload = JSON.parse((push.sendNotification.mock.calls[0] as unknown as [unknown, string])[1]);
    expect(payload).toMatchObject({ title: 'Alex: Milk?', data: { url: '/groceries' } });
  });

  it('only between household members', async () => {
    await expect(sendMessage({ from: 'u9', to: 'u2', title: 'hi' })).rejects.toMatchObject({ status: 403 });
    await expect(sendMessage({ from: 'u1', to: 'u9', title: 'hi' })).rejects.toMatchObject({ status: 404 });
    expect(fake.createFn).not.toHaveBeenCalled();
  });
});

describe('takeMessageSlot', () => {
  it(`allows ${RATE_LIMIT} an hour per sender, then says when the next frees up`, () => {
    const start = 1_000_000;
    for (let i = 0; i < RATE_LIMIT; i++) expect(takeMessageSlot('u1', start + i).ok).toBe(true);
    expect(takeMessageSlot('u1', start + 60_000)).toEqual({ ok: false, retryAfter: RATE_WINDOW_MS / 1000 - 60 });
    expect(takeMessageSlot('u2', start).ok).toBe(true);
    expect(takeMessageSlot('u1', start + RATE_WINDOW_MS).ok).toBe(true);
  });
});
