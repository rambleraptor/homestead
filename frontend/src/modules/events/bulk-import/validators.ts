/**
 * Events Bulk Import - Field Validators
 */

import type { FieldValidator } from '@/shared/bulk-import';
import type { EventType, NotificationPreference } from '../types';

/**
 * Validates event_type field
 */
export const validateEventType: FieldValidator<EventType> = (value) => {
  const eventType = value.toLowerCase().trim() as EventType;

  if (eventType !== 'birthday' && eventType !== 'anniversary') {
    return {
      value: eventType,
      error: 'event_type must be "birthday" or "anniversary"',
    };
  }

  return { value: eventType };
};

/**
 * Validates title field
 */
export const validateTitle: FieldValidator<string> = (value) => {
  const title = value.trim();

  if (title.length > 200) {
    return {
      value: title,
      error: 'title must be 200 characters or less',
    };
  }

  return { value: title };
};

/**
 * Validates people_involved field
 */
export const validatePeopleInvolved: FieldValidator<string> = (value) => {
  const peopleInvolved = value.trim();

  if (peopleInvolved.length > 500) {
    return {
      value: peopleInvolved,
      error: 'people_involved must be 500 characters or less',
    };
  }

  return { value: peopleInvolved };
};

/**
 * Validates event_date field (YYYY-MM-DD format)
 */
export const validateEventDate: FieldValidator<string> = (value) => {
  const eventDate = value.trim();

  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(eventDate)) {
    return {
      value: eventDate,
      error: 'event_date must be in YYYY-MM-DD format',
    };
  }

  const date = new Date(eventDate);
  const timestamp = date.getTime();

  if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
    return {
      value: eventDate,
      error: 'event_date must be a valid date',
    };
  }

  if (!date.toISOString().startsWith(eventDate)) {
    return {
      value: eventDate,
      error: 'event_date must be a valid date',
    };
  }

  return { value: eventDate };
};

/**
 * Validates recurring_yearly field
 */
export const validateRecurringYearly: FieldValidator<boolean> = (value) => {
  const recurringValue = value.toLowerCase().trim();

  if (recurringValue === 'false' || recurringValue === 'no' || recurringValue === '0') {
    return { value: false };
  }

  if (recurringValue === 'true' || recurringValue === 'yes' || recurringValue === '1') {
    return { value: true };
  }

  return {
    value: true,
    error: 'recurring_yearly must be "true", "false", "yes", "no", "1", or "0"',
  };
};

/**
 * Validates details field
 */
export const validateDetails: FieldValidator<string | undefined> = (value) => {
  const details = value.trim();

  if (!details) {
    return { value: undefined };
  }

  if (details.length > 2000) {
    return {
      value: details,
      error: 'details must be 2000 characters or less',
    };
  }

  return { value: details };
};

/**
 * Validates notification_preferences field
 */
export const validateNotificationPreferences: FieldValidator<
  NotificationPreference[]
> = (value) => {
  const notifValue = value.trim();

  if (!notifValue) {
    return { value: ['day_of'] };
  }

  const parsed = notifValue.split(',').map((v) => v.trim() as NotificationPreference);
  const validPrefs = ['day_of', 'day_before', 'week_before'];
  const invalidPrefs = parsed.filter((p) => !validPrefs.includes(p));

  if (invalidPrefs.length > 0) {
    return {
      value: ['day_of'],
      error: `Invalid notification preferences: ${invalidPrefs.join(', ')}`,
    };
  }

  return { value: parsed };
};
