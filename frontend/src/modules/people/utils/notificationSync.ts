/**
 * Notification Sync Utility for People Module
 *
 * Handles syncing recurring notifications when people are created/updated.
 * Branches on the `notifications` flag (not `people`) because the writes
 * land in the notifications collection.
 *
 * In aepbase, recurring-notifications is a child of users, so the URL is
 * `/users/{user_id}/recurring-notifications`. The user id comes from
 * `aepbase.getCurrentUser()` in aepbase mode.
 *
 * Templates store placeholders ({{name}}, {{date}}) that are resolved at
 * send-time from the source record so name changes flow through.
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import type { NotificationPreference } from '../types';
import type {
  RecurringNotification,
  NotificationTiming,
} from '@/modules/notifications/types';

const BIRTHDAY_TEMPLATES = {
  title: 'Birthday Reminder - {{name}}',
  message: "{{name}}'s birthday is coming up on {{date}}!",
};

const ANNIVERSARY_TEMPLATES = {
  title: 'Anniversary Reminder - {{name}}',
  message: "{{name}}'s anniversary is coming up on {{date}}!",
};

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

interface AepRecurringNotification extends RecurringNotification {
  path: string;
  create_time: string;
  update_time: string;
}

function aepUserId(): string | null {
  return aepbase.getCurrentUser()?.id || null;
}

async function listRecurringForPerson(
  userId: string,
  personId: string,
  dateField?: 'birthday' | 'anniversary',
): Promise<RecurringNotification[]> {
  if (isAepbaseEnabled('notifications')) {
    const all = await aepbase.list<AepRecurringNotification>(
      AepCollections.RECURRING_NOTIFICATIONS,
      { parent: [AepCollections.USERS, userId] },
    );
    return all.filter(
      (n) =>
        n.source_collection === 'people' &&
        n.source_id === personId &&
        (dateField ? n.reference_date_field === dateField : true),
    );
  }

  const escapedUserId = escapeFilterValue(userId);
  const escapedPersonId = escapeFilterValue(personId);
  const filterParts = [
    `user_id="${escapedUserId}"`,
    `source_collection="people"`,
    `source_id="${escapedPersonId}"`,
  ];
  if (dateField) filterParts.push(`reference_date_field="${dateField}"`);
  return await getCollection<RecurringNotification>(
    Collections.RECURRING_NOTIFICATIONS,
  ).getFullList({ filter: filterParts.join(' && ') });
}

async function createRecurringNotification(
  userId: string,
  body: Omit<RecurringNotification, 'id' | 'created' | 'updated'>,
): Promise<void> {
  if (isAepbaseEnabled('notifications')) {
    await aepbase.create(AepCollections.RECURRING_NOTIFICATIONS, body, {
      parent: [AepCollections.USERS, userId],
    });
    return;
  }
  await getCollection<RecurringNotification>(
    Collections.RECURRING_NOTIFICATIONS,
  ).create(body);
}

async function deleteRecurringNotification(
  userId: string,
  id: string,
): Promise<void> {
  if (isAepbaseEnabled('notifications')) {
    await aepbase.remove(AepCollections.RECURRING_NOTIFICATIONS, id, {
      parent: [AepCollections.USERS, userId],
    });
    return;
  }
  await getCollection<RecurringNotification>(
    Collections.RECURRING_NOTIFICATIONS,
  ).delete(id);
}

function currentUserId(): string | null {
  if (isAepbaseEnabled('notifications')) {
    return aepUserId();
  }
  return pb.authStore.record?.id || null;
}

export async function syncRecurringNotificationsForPerson(
  personId: string,
  _personName: string,
  birthday: string | undefined,
  anniversary: string | undefined,
  preferences: NotificationPreference[],
): Promise<void> {
  const userId = currentUserId();
  if (!userId) {
    throw new Error('User not authenticated');
  }

  const desiredTimings = preferences as NotificationTiming[];

  await Promise.all([
    syncNotificationsForDateField(
      userId,
      personId,
      'birthday',
      birthday,
      desiredTimings,
      BIRTHDAY_TEMPLATES,
    ),
    syncNotificationsForDateField(
      userId,
      personId,
      'anniversary',
      anniversary,
      desiredTimings,
      ANNIVERSARY_TEMPLATES,
    ),
  ]);
}

async function syncNotificationsForDateField(
  userId: string,
  personId: string,
  dateField: 'birthday' | 'anniversary',
  dateValue: string | undefined,
  desiredTimings: NotificationTiming[],
  templates: { title: string; message: string },
): Promise<void> {
  const existing = await listRecurringForPerson(userId, personId, dateField);
  const existingTimings = new Map(existing.map((n) => [n.timing, n]));

  if (!dateValue) {
    await Promise.all(
      existing.map((notification) =>
        deleteRecurringNotification(userId, notification.id),
      ),
    );
    return;
  }

  const toCreate: NotificationTiming[] = [];
  const toDelete: RecurringNotification[] = [];

  for (const timing of desiredTimings) {
    if (!existingTimings.has(timing)) toCreate.push(timing);
  }
  const desiredSet = new Set(desiredTimings);
  for (const [timing, notification] of existingTimings) {
    if (!desiredSet.has(timing)) toDelete.push(notification);
  }

  await Promise.all([
    ...toCreate.map((timing) =>
      createRecurringNotification(userId, {
        user_id: userId,
        source_collection: 'people',
        source_id: personId,
        title_template: templates.title,
        message_template: templates.message,
        reference_date_field: dateField,
        timing,
        enabled: true,
      } as Omit<RecurringNotification, 'id' | 'created' | 'updated'>),
    ),
    ...toDelete.map((notification) =>
      deleteRecurringNotification(userId, notification.id),
    ),
  ]);
}

export async function deleteRecurringNotificationsForPerson(
  personId: string,
): Promise<void> {
  const userId = currentUserId();
  if (!userId) return;

  const notifications = await listRecurringForPerson(userId, personId);
  await Promise.all(
    notifications.map((notification) =>
      deleteRecurringNotification(userId, notification.id),
    ),
  );
}

export async function getNotificationTimingsForPerson(
  personId: string,
): Promise<{ birthday: NotificationTiming[]; anniversary: NotificationTiming[] }> {
  const userId = currentUserId();
  if (!userId) return { birthday: [], anniversary: [] };

  const notifications = await listRecurringForPerson(userId, personId);
  const result = {
    birthday: [] as NotificationTiming[],
    anniversary: [] as NotificationTiming[],
  };
  for (const notification of notifications) {
    if (notification.reference_date_field === 'birthday') {
      result.birthday.push(notification.timing);
    } else if (notification.reference_date_field === 'anniversary') {
      result.anniversary.push(notification.timing);
    }
  }
  return result;
}
