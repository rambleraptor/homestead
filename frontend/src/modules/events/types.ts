export type EventType = 'birthday' | 'anniversary';

export type NotificationPreference = 'day_of' | 'day_before' | 'week_before';

export interface Event {
  id: string;
  event_type: EventType;
  title: string;
  people_involved: string;
  event_date: string;
  recurring_yearly: boolean;
  details?: string;
  notification_preferences: NotificationPreference[];
  created_by: string;
  created: string;
  updated: string;
}

export interface EventFormData {
  event_type: EventType;
  title: string;
  people_involved: string;
  event_date: string;
  recurring_yearly: boolean;
  details?: string;
  notification_preferences: NotificationPreference[];
}

export interface EventStats {
  totalEvents: number;
  upcomingBirthdays: number;
  upcomingAnniversaries: number;
}

export interface NotificationPreferenceOption {
  value: NotificationPreference;
  label: string;
  description: string;
}

export const NOTIFICATION_PREFERENCE_OPTIONS: NotificationPreferenceOption[] = [
  {
    value: 'day_of',
    label: 'Day of',
    description: 'Get notified on the day of the event',
  },
  {
    value: 'day_before',
    label: 'Day before',
    description: 'Get notified one day before the event',
  },
  {
    value: 'week_before',
    label: 'Week before',
    description: 'Get notified one week before the event',
  },
];
