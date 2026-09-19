/**
 * People App Configuration
 *
 * App for managing contact information, partners, and addresses.
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
        path: 'export',
        component: () => import('./bulk-export').then((m) => m.PeopleBulkExport),
      },
      // After the static `import`/`export` paths so they aren't captured as a person id.
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
