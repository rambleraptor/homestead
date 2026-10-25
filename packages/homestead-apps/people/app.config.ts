/**
 * People App Configuration
 *
 * App for managing contact information, family relationships, and households.
 * Yearly-recurring events (birthdays, anniversaries, …) live in the
 * Events app.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { peopleResources } from './resources';

export const peopleApp: AppConfig = {
  id: 'people',
  name: 'People',
  description: 'Manage contact information and important dates for people you know',
  resources: peopleResources,
  chat: {
    context: () => import('./chat/context'),
    instructions: [
      'When someone mentions a person by name ("remind Sam", "Mom\'s birthday"), ' +
        'look them up with the "people" tool\'s list action first and use that record\'s ' +
        'id. People usually give a first name or a nickname, so match loosely on both: ' +
        '`name.contains("Sam") || aliases.exists(a, a.contains("Sam"))`.',
      'If more than one person matches a question, answer it for each of them ' +
        '(both Jakes\' addresses, say). Ask which one only before changing ' +
        'something for one of them.',
    ],
    values: {
      address: {
        description: 'a postal address, written on one line',
        example: '12 Oak St, Springfield, IL 62704',
        component: () => import('./components/AddressValue'),
      },
    },
  },
  // Partnership moved from person-shared-data's person_b to partner
  // relationship rows. One-shot and idempotent.
  migrations: [
    {
      id: 'people-backfill-partner-relationships',
      title: 'Copy partners into person relationships',
      load: () => import('./migrations/backfill-partner-relationships'),
    },
    // Addresses moved from person-shared-data + address to households.
    // One-shot and idempotent; the legacy rows are left for a later drop.
    {
      id: 'people-backfill-households',
      title: 'Turn shared addresses into households',
      load: () => import('./migrations/backfill-households'),
    },
  ],
  userSettings: {
    map_provider: {
      type: 'enum',
      label: 'Map provider',
      description:
        'Which map service to use when opening addresses from People.',
      options: ['google', 'apple'],
      default: 'google',
    },
  },
  web: {
    icon: () => import('lucide-react').then((m) => m.Users),
    basePath: '/people',
    homeScreenIcon: '/app-icons/people.png',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/PeopleHome').then((m) => m.PeopleHome),
      },
      {
        path: 'import',
        component: () => import('./bulk-import').then((m) => m.PeopleBulkImport),
      },
      {
        path: 'households',
        component: () => import('./components/HouseholdsHome').then((m) => m.HouseholdsHome),
      },
      {
        path: 'export',
        component: () => import('./bulk-export').then((m) => m.PeopleBulkExport),
      },
      // After the static paths so they aren't captured as a person id.
      {
        path: ':id',
        component: () =>
          import('./components/PersonDetailRoute').then((m) => m.PersonDetailRoute),
        dynamic: true,
      },
    ],
    section: 'Relationships',
    showInNav: true,
    navOrder: 3,
    filters: [
      {
        key: 'name',
        label: 'Name',
        type: 'text',
        description:
          "A substring of the person's name. Used by the People list's name filter.",
      },
    ],
  },
};
