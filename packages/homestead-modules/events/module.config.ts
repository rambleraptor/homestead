/**
 * Events Module Configuration
 *
 * Yearly-recurring household events (birthdays, anniversaries, …).
 * Source of truth for the dashboard's upcoming-events widget.
 */

import { CalendarHeart } from 'lucide-react';
import type { HomeModule } from '@/modules/types';
import { EventsHome } from './components/EventsHome';
import { UpcomingEventsWidget } from './components/UpcomingEventsWidget';
import { eventsResources } from './resources';

export const eventsModule: HomeModule = {
  id: 'events',
  name: 'Events',
  description: 'Track yearly-recurring household events',
  icon: CalendarHeart,
  basePath: '/events',
  routes: [{ path: '', index: true, component: EventsHome }],
  showInNav: true,
  navOrder: 4,
  section: 'Relationships',
  enabled: true,
  resources: eventsResources,
  widgets: [
    {
      id: 'events-upcoming',
      label: 'Upcoming events',
      component: UpcomingEventsWidget,
      order: 20,
    },
  ],
};
