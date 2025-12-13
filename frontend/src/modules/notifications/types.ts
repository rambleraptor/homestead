export type NotificationType = 'day_of' | 'day_before' | 'week_before' | 'system';

export interface Notification {
  id: string;
  user_id: string;
  event_id?: string;
  title: string;
  message: string;
  notification_type: NotificationType;
  scheduled_for?: string;
  sent_at?: string;
  read: boolean;
  read_at?: string;
  created: string;
  updated: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  read: number;
}
