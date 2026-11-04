import { appExists } from '@rambleraptor/homestead-core/apps/registry';
import { getTodaysHoliday, type Holiday } from '@rambleraptor/homestead-core/shared/utils/dateUtils';

/** Starter prompts, each shown only when the app it needs is installed. */
const STARTERS: { text: string; app: string }[] = [
  { text: "What's on my todo list?", app: 'todos' },
  { text: 'Add milk to the grocery list', app: 'groceries' },
  { text: 'Which gift cards still have a balance?', app: 'gift-cards' },
  { text: 'What birthdays are coming up?', app: 'events' },
];

/**
 * One starter per holiday, shown only on the day and only with its app
 * installed, ahead of the everyday ones.
 */
export const HOLIDAY_STARTERS: { holiday: string; text: string; app: string }[] = [
  { holiday: 'thanksgiving', text: 'Plan the Thanksgiving grocery list', app: 'groceries' },
  { holiday: 'christmas-eve', text: 'Which gift cards can we use today?', app: 'gift-cards' },
  { holiday: 'christmas', text: 'Which gift cards can we use today?', app: 'gift-cards' },
  { holiday: 'halloween', text: 'Add buy candy to my todos', app: 'todos' },
];

/** The starter prompts for this instance's apps, in order; today's holiday starter first. */
export function availableStarters(holiday: Holiday | null = getTodaysHoliday()): string[] {
  const seasonal = holiday
    ? HOLIDAY_STARTERS.filter((s) => s.holiday === holiday.id && appExists(s.app)).map((s) => s.text)
    : [];
  return [...seasonal, ...STARTERS.filter((s) => appExists(s.app)).map((s) => s.text)];
}
