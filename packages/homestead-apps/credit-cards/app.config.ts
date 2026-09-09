/**
 * Credit Cards App Configuration
 *
 * App for tracking credit card perks and rewards
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { creditCardsResources } from './resources';

export const creditCardsApp: AppConfig = {
  id: 'credit-cards',
  name: 'Credit Cards',
  description: 'Track credit card perks and maximize rewards',
  resources: creditCardsResources,
  // Perk-window reminders were withdrawn: a monthly perk closes twelve times a
  // year, and even digested per card and floored by value it was more
  // interruption than the app earned. The perks list and its dashboard widget
  // still show what's closing — you look at them when you want to know, which
  // is the right posture for this app.
  //
  // `credit-cards-drop-perk-reminders` clears up after it: the queued
  // notifications, which nothing reconciles any more, and the per-user opt-in.
  migrations: [
    {
      id: 'credit-cards-drop-perk-reminders',
      title: 'Withdraw perk-window reminders',
      // The handler empties this column, which is what lets the user-settings
      // sync drop it. Declaring the drop as well makes the sync succeed even if
      // the handler only got partway — the two are belt and braces, not
      // alternatives.
      drops: [{ resource: 'user-preference', field: 'credit_cards__perk_reminder' }],
      load: () => import('./migrations/drop-perk-reminders'),
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.CreditCard),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/CreditCardsHome').then((m) => m.CreditCardsHome),
      },
    ],
    showInNav: true,
    navOrder: 5,
    section: 'Money',
    widgets: [
      {
        id: 'credit-cards-upcoming-perks',
        label: 'Upcoming credit card perks',
        component: () =>
          import('./components/UpcomingPerksWidget').then(
            (m) => m.UpcomingPerksWidget,
          ),
        order: 20,
      },
    ],
  },
};
