/**
 * Validation constants used across the application
 */

// File size limits (in bytes)
export const MAX_IMAGE_SIZE = 5242880; // 5MB
export const MAX_IMAGE_SIZE_MB = 5;

// Accepted MIME types for images
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

// Field length limits
export const MAX_EVENT_TITLE_LENGTH = 200;
export const MAX_EVENT_PEOPLE_LENGTH = 500;
export const MAX_EVENT_DETAILS_LENGTH = 2000;

// Event notification preferences
export const VALID_NOTIFICATION_PREFERENCES = [
  'day_of',
  'day_before',
  'week_before',
] as const;

export type NotificationPreference = typeof VALID_NOTIFICATION_PREFERENCES[number];
