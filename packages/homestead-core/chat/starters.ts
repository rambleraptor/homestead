import { appExists } from '@rambleraptor/homestead-core/apps/registry';

/** Starter prompts, each shown only when the app it needs is installed. */
const STARTERS: { text: string; app: string }[] = [
  { text: "What's on my todo list?", app: 'todos' },
  { text: 'Add milk to the grocery list', app: 'groceries' },
  { text: 'Which gift cards still have a balance?', app: 'gift-cards' },
  { text: 'What birthdays are coming up?', app: 'events' },
];

/** The starter prompts for this instance's apps, in order. */
export function availableStarters(): string[] {
  return STARTERS.filter((s) => appExists(s.app)).map((s) => s.text);
}
