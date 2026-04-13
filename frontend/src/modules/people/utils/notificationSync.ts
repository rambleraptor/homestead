/**
 * Notification Sync Utility for People Module
 *
 * Syncs recurring notifications when people are created/updated. Templates
 * store placeholders ({{name}}, {{date}}) that are resolved at send-time.
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
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

interface AepRecurringNotification extends RecurringNotification {
  path: string;
  create_time: string;
  update_time: string;
}

async function listRecurringForPerson(
  userId: string,
  personId: string,
  dateField?: 'birthday' | 'anniversary',
): Promise<RecurringNotification[]> {
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

async function createRecurringNotification(
  userId: string,
  body: Omit<RecurringNotification, 'id' | 'created' | 'updated'>,
): Promise<void> {
  await aepbase.create(AepCollections.RECURRING_NOTIFICATIONS, body, {
    parent: [AepCollections.USERS, userId],
  });
}

async function deleteRecurringNotification(
  userId: string,
  id: string,
): Promise<void> {
  await aepbase.remove(AepCollections.RECURRING_NOTIFICATIONS, id, {
    parent: [AepCollections.USERS, userId],
  });
}

export async function syncRecurringNotificationsForPerson(
  personId: string,
  _personName: string,
  birthday: string | undefined,
  anniversary: string | undefined,
  preferences: NotificationPreference[],
): Promise<void> {
  const userId = aepbase.getCurrentUser()?.id;
  if (!userId) throw new Error('User not authenticated');

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
      existing.map((notification) => deleteRecurringNotification(userId, notification.id)),
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
  const userId = aepbase.getCurrentUser()?.id;
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
  const userId = aepbase.getCurrentUser()?.id;
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
