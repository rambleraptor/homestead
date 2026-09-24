/**
 * The key of the Devices app's per-user low-battery reminder opt-in.
 *
 * Its own module because the toggle is a browser component and the sync that
 * reads the setting is server-only (vite stubs `syncs/` out of the client
 * bundle), so neither may import the other.
 */
export const BATTERY_REMINDER_SETTING = 'battery_reminder';
