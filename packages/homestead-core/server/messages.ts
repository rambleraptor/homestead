/**
 * Household messages: one member sends another a notification — a push to
 * their devices and a row in their inbox, marked as from the sender.
 *
 * `sendMessage` is the one way in. The `users/{id}/notifications:send` custom
 * method wraps it for every outside caller (the SPA, scripts with a personal
 * access token, the CLI, MCP, the assistant), adding who-may-send and a rate
 * limit; server code (an app, a cron) calls it directly.
 *
 * The recipient's inbox is theirs alone, so the row is written with a system
 * token (`./system-token`) — after the rules here have decided the message may
 * go. A push is best-effort on top: the inbox row is written first, and with no
 * VAPID keys (or no devices) the message still arrives there.
 */

import { serverClient } from './client';
import { householdMembers } from './household';
import { withSystemToken } from './system-token';
import { configureWebPush, pushToDevices, type NotificationSubscriptionRecord } from './notifications';

export const MAX_MESSAGE_TITLE = 80;
export const MAX_MESSAGE_BODY = 500;

export interface MessageInput {
  /** The sender's user id. */
  from: string;
  /** The recipient's user id. */
  to: string;
  title: string;
  body?: string;
  /** An in-app path opened when it's tapped. */
  url?: string;
}

export interface MessageResult {
  /** The inbox row written, as `users/{to}/notifications/{id}`. */
  notification: string;
  /** Devices the push reached, and failed on. */
  delivered: number;
  failed: number;
}

/** A message refused, with the HTTP status that says why. */
export class MessageError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MessageError';
  }
}

/** An in-app path: `/…`, but never `//…` (another host) or anything with a scheme. */
export function isInAppPath(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') && !/[\r\n]/.test(url);
}

/** The message's own content, checked: trimmed, within limits, an in-app link. */
export function checkMessage(input: { title?: unknown; body?: unknown; url?: unknown }): {
  title: string;
  body: string;
  url?: string;
} {
  if (typeof input.title !== 'string' || !input.title.trim()) {
    throw new MessageError(400, 'a message needs a title');
  }
  const title = input.title.trim();
  if (title.length > MAX_MESSAGE_TITLE) {
    throw new MessageError(400, `a message title is at most ${MAX_MESSAGE_TITLE} characters`);
  }
  if (input.body !== undefined && typeof input.body !== 'string') {
    throw new MessageError(400, 'a message body is text');
  }
  const body = (input.body ?? '').trim();
  if (body.length > MAX_MESSAGE_BODY) {
    throw new MessageError(400, `a message body is at most ${MAX_MESSAGE_BODY} characters`);
  }
  if (input.url !== undefined && (typeof input.url !== 'string' || !isInAppPath(input.url))) {
    throw new MessageError(400, 'a message link must be a path in this Homestead, like /groceries');
  }
  return { title, body, url: input.url as string | undefined };
}

export async function sendMessage(input: MessageInput): Promise<MessageResult> {
  const { title, body, url } = checkMessage(input);
  const members = householdMembers();
  const sender = members.find((m) => m.id === input.from);
  if (!sender) throw new MessageError(403, 'only household members can send messages');
  if (!members.some((m) => m.id === input.to)) {
    throw new MessageError(404, `no one in the household has user id "${input.to}"`);
  }

  return withSystemToken(async (token) => {
    const recipient = serverClient(token).collection('users').record(input.to);
    const row = await recipient.collection<{ id: string }>('notifications').create({
      title,
      message: body,
      notification_type: 'message',
      from_user: `users/${sender.id}`,
      url: url ?? '/notifications',
      read: false,
      sent_at: new Date().toISOString(),
    });
    const notification = `users/${input.to}/notifications/${row.id}`;

    if (!configureWebPush()) return { notification, delivered: 0, failed: 0 };
    const devices = (
      await recipient.collection<NotificationSubscriptionRecord>('notification-subscriptions').listAll()
    ).filter((d) => d.enabled === true);
    const { sent, failed } = await pushToDevices(token, input.to, devices, {
      title: `${sender.name}: ${title}`,
      body,
      tag: `message-${row.id}`,
      url: url ?? '/notifications',
    });
    return { notification, delivered: sent, failed };
  });
}

/** Messages one person may send in {@link RATE_WINDOW_MS}. */
export const RATE_LIMIT = 10;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

const sentAt = new Map<string, number[]>();

/**
 * Take one of `senderId`'s sends for this hour, or say how many seconds until
 * one frees up. In-process, which is the whole server.
 */
export function takeMessageSlot(senderId: string, now: number = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
  const recent = (sentAt.get(senderId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    sentAt.set(senderId, recent);
    return { ok: false, retryAfter: Math.ceil((recent[0]! + RATE_WINDOW_MS - now) / 1000) };
  }
  recent.push(now);
  sentAt.set(senderId, recent);
  return { ok: true };
}

/** Forget every sender's sends (tests). */
export function resetMessageSlots(): void {
  sentAt.clear();
}
