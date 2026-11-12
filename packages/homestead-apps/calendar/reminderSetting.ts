/**
 * The per-person opt-in for calendar reminders. Its own module so the page
 * (which shows the switch) and the server-side reminder code (which reads it)
 * share the key without either importing the other.
 */
export const EVENT_REMINDER_SETTING = 'event_reminder';
