/**
 * People Module Configuration
 *
 * Module for managing contact information and important dates.
 * Supports tracking birthdays, anniversaries, and addresses.
 */

import { Users } from 'lucide-react';
import type { HomeModule } from '../types';
import { peopleOmnibox } from './omnibox';

export const PEOPLE_SERVER_SEARCH_OPTIONS = ['superuser', 'all', 'none'] as const;
export type PeopleServerSearchAccess =
  (typeof PEOPLE_SERVER_SEARCH_OPTIONS)[number];

export const peopleModule: HomeModule = {
  id: 'people',
  name: 'People',
  description: 'Manage contact information and important dates for people you know',
  icon: Users,
  basePath: '/people',
  routes: [
    { path: '', index: true },
    { path: 'import' },
  ],
  section: 'Relationships',
  showInNav: true,
  navOrder: 3,
  enabled: true,
  omnibox: peopleOmnibox,
  flags: {
    server_search: {
      type: 'enum',
      label: 'Server-side people search',
      description:
        'Who gets server-side People search (CEL filter on aepbase) instead of client-side filtering of the fetched collection.',
      options: PEOPLE_SERVER_SEARCH_OPTIONS,
      default: 'none',
    },
  },
};
