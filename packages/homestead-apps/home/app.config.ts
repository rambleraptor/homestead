/**
 * Home App Configuration
 *
 * A single page covering the house itself: upcoming curb pickups (from the
 * `garbage-pickup` collection this app owns), the recurring upkeep the house
 * needs (`home-task` — gutters, furnace filters, and the notes you need to do
 * them), and the household's home-related documents (manuals, warranties,
 * insurance, property tax), which are surfaced by reusing the Documents app's
 * data. The asset inventory is a planned follow-up.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { homeResources } from './resources';
import { PICKUP_REMINDER_SETTING } from './pickupReminderSetting';
import { TASK_REMINDER_SETTING } from './taskReminderSetting';

export const homeApp: AppConfig = {
  id: 'home',
  name: 'Home',
  description: 'Curb pickups, upkeep reminders, and home documents in one place',
  resources: homeResources,
  userSettings: {
    // Opt-in per person: whoever wheels the bins out wants the nudge, and a
    // household-wide flag would buzz everyone else's phone every week.
    [PICKUP_REMINDER_SETTING]: {
      type: 'boolean',
      label: 'Remind me the night before pickup',
      description:
        'Get a reminder at 6pm the evening before each collection day, listing which bins go out.',
      default: false,
    },
    // Same reasoning, one step softer: the upkeep list is shared household
    // data, so anyone may be the one to act on it — but a notification is
    // still a personal interruption, and the switch sits next to the list it
    // governs rather than in Settings.
    [TASK_REMINDER_SETTING]: {
      type: 'boolean',
      label: 'Remind me about home upkeep',
      description:
        'Get a reminder the morning each maintenance task comes due — plus whatever you saved in its notes.',
      default: false,
    },
  },
  // Turns the pickup calendar into notifications queued for 18:00 the evening
  // before each collection; the notifications app's dispatcher delivers them.
  // Runs before the household is awake, and catches up at boot so a restart
  // can't lose tonight's bin reminder. Handler lives under `crons/`, so it's
  // stubbed out of the browser bundle.
  crons: [
    {
      id: 'home-pickup-reminders',
      title: 'Bin night reminders',
      dailyAtHour: 4,
      runOnStart: true,
      load: () => import('./crons/pickup-reminders'),
    },
    // The upkeep half of the same idea: turns due (and overdue) maintenance
    // tasks into notifications for whoever opted in. Runs just after the
    // pickup pass, and catches up at boot so a restart can't lose today's.
    {
      id: 'home-task-reminders',
      title: 'Home upkeep reminders',
      dailyAtHour: 5,
      runOnStart: true,
      load: () => import('./crons/task-reminders'),
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.House),
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/HomePage').then((m) => m.HomePage),
      },
    ],
    showInNav: true,
    // Leads the "Home" nav section, ahead of Documents (navOrder 5).
    navOrder: 1,
    section: 'Home',
    widgets: [
      {
        id: 'home-next-pickup',
        label: 'Next pickup',
        component: () =>
          import('./components/NextPickupWidget').then((m) => m.NextPickupWidget),
        order: 15,
      },
    ],
  },
};
