/**
 * Dashboard Module Types
 */

export interface DashboardWidget {
  id: string;
  title: string;
  type: 'stat' | 'chart' | 'list' | 'custom';
  data?: unknown;
  config?: Record<string, unknown>;
}

export interface DashboardData {
  widgets: DashboardWidget[];
  lastUpdated: string;
}

export interface DashboardStats {
  totalUsers: number;
  activeModules: number;
  recentActivity: number;
}

/**
 * Notification types for dashboard
 */
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
