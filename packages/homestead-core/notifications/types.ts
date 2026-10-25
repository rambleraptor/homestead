export type NotificationType =
  | 'day_of'
  | 'day_before'
  | 'week_before'
  /** A scheduled notification came due and the dispatcher delivered it. */
  | 'reminder'
  | 'system'
  /** Sent by another household member (`from_user`), through `notifications:send`. */
  | 'message';

export interface Notification {
  id: string;
  user_id: string;
  /** @deprecated Use source_collection + source_id instead */
  person_id?: string;
  title: string;
  message: string;
  notification_type: NotificationType;
  scheduled_for?: string;
  sent_at?: string;
  read: boolean;
  read_at?: string;
  created: string;
  updated: string;
  source_collection?: string;
  source_id?: string;
  /** Path opened when the notification is tapped. */
  url?: string;
  /** The sender of a `message` (`users/{id}`). */
  from_user?: string;
}

/**
 * Where a scheduled notification is in its life. `scheduled` is the only state
 * the dispatcher acts on; everything else is terminal.
 */
export type ScheduledNotificationStatus =
  | 'scheduled'
  | 'sent'
  | 'canceled'
  | 'missed'
  | 'failed';

/**
 * A notification queued for a future instant
 * (`/users/{id}/scheduled-notifications`). One row per recipient — fan-out
 * happens when something is scheduled, not when it is delivered.
 */
export interface ScheduledNotification {
  id: string;
  title: string;
  message: string;
  url?: string;
  /** RFC3339 UTC. */
  send_at: string;
  status: ScheduledNotificationStatus;
  sent_at?: string;
  attempts?: number;
  last_error?: string;
  notification_id?: string;
  /**
   * Id of the app that scheduled this. Unset means a person did — which is what
   * decides whether the row is editable, since an app's rows are reconciled
   * from their source record on every run.
   */
  source_app?: string;
  /** The scheduling app's idempotency key. Opaque outside that app. */
  source_key?: string;
  source_collection?: string;
  source_id?: string;
  create_time?: string;
  update_time?: string;
}

/** Fields a person can set when scheduling one by hand. */
export interface ScheduledNotificationFormData {
  title: string;
  /** `null` clears previously-entered text on update. */
  message?: string | null;
  send_at: string;
}

/** True when this row was raised by an app rather than typed by a person. */
export function isAppScheduled(row: ScheduledNotification): boolean {
  return Boolean(row.source_app);
}

export interface NotificationStats {
  total: number;
  unread: number;
  read: number;
}
