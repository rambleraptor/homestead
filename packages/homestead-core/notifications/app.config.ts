/**
 * Notifications App Configuration
 *
 * Two halves of one idea: the **inbox** (what has been delivered) and the
 * **queue** (what is scheduled to be). The dispatcher cron moves rows from the
 * second to the first — it is the only thing in Homestead that pushes on a
 * schedule, which is why it lives here rather than in whichever feature app
 * happened to want reminders first.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { notificationsResources } from './resources';

export const notificationsApp: AppConfig = {
  id: 'notifications',
  name: 'Notifications',
  description: 'View and manage your notifications',
  resources: notificationsResources,
  // Handler lives under `crons/`, so vite stubs it out of the browser bundle.
  crons: [
    {
      id: 'notifications-dispatch',
      title: 'Deliver scheduled notifications',
      // A minute is the resolution a person can actually ask for ("remind me at
      // 4:15"), and the handler is a filtered list per user — cheap enough to
      // run this often at household scale.
      intervalSeconds: 60,
      // Catch up on anything that came due while the box was down; the
      // handler's own grace window decides what is still worth sending.
      runOnStart: true,
      load: () => import('./crons/dispatch'),
    },
  ],
  migrations: [
    {
      id: 'notifications-adopt-reminders',
      title: 'Adopt hand-typed reminders into the queue',
      load: () => import('./migrations/adopt-reminders'),
    },
    // Must stay *after* the adoption above: migrations run in array order
    // within an app, and this deletes the collection that one reads. Filed here
    // rather than in events (which owned the resource) for exactly that reason —
    // events registers first, so there it would run too early.
    {
      id: 'notifications-drop-reminders-collection',
      title: 'Drop the retired reminder collection',
      destructive: true,
      load: () => import('./migrations/drop-reminders-collection'),
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.Bell),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/NotificationsHome').then((m) => m.NotificationsHome),
      },
    ],
    placement: 'topbar',
    topBarBadge: () =>
      import('./components/NotificationsTopBarBadge').then(
        (m) => m.NotificationsTopBarBadge,
      ),
    navOrder: 4,
  },
};
