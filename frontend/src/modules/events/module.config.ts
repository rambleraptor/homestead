import { Calendar } from 'lucide-react';
import type { HomeModule } from '../types';
import { eventRoutes } from './routes';

export const eventsModule: HomeModule = {
  id: 'events',
  name: 'Events',
  description: 'Track important birthdays and anniversaries',
  icon: Calendar,
  basePath: '/events',
  routes: eventRoutes,
  showInNav: true,
  navOrder: 3,
  enabled: true,
};
