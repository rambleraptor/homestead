/**
 * People Module Configuration
 *
 * Module for managing contact information and important dates.
 * Supports tracking birthdays, anniversaries, and addresses.
 */

import { Users } from 'lucide-react';
import type { HomeModule } from '@/modules/types';
import { peopleOmnibox } from './omnibox';
import { PeopleHome } from './components/PeopleHome';
import { PeopleBulkImport } from './bulk-import';
import { peopleResources } from './resources';

export const peopleModule: HomeModule = {
  id: 'people',
  name: 'People',
  description: 'Manage contact information and important dates for people you know',
  icon: Users,
  basePath: '/people',
  routes: [
    { path: '', index: true, component: PeopleHome },
    { path: 'import', component: PeopleBulkImport },
  ],
  section: 'Relationships',
  showInNav: true,
  navOrder: 3,
  enabled: true,
  resources: peopleResources,
  omnibox: peopleOmnibox,
  filters: [
    {
      key: 'name',
      label: 'Name',
      type: 'text',
      description:
        "A substring of the person's name. Used by the People list's name filter.",
    },
  ],
};
