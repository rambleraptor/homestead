/**
 * People Module Configuration
 *
 * Module for managing contact information and important dates.
 * Supports tracking birthdays, anniversaries, and addresses.
 */

import { Users } from 'lucide-react';
import type { HomeModule } from '../types';
import { peopleOmnibox } from './omnibox';
import { UpcomingEventsWidget } from './components/UpcomingEventsWidget';

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
  filters: [
    {
      key: 'name',
      label: 'Name',
      type: 'text',
      description:
        "A substring of the person's name. Used by the People list's name filter.",
    },
  ],
  widgets: [
    {
      id: 'people-upcoming-events',
      component: UpcomingEventsWidget,
      order: 20,
    },
  ],
};
