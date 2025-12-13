import type { RouteObject } from 'react-router-dom';
import { EventsHome } from './components/EventsHome';

export const eventRoutes: RouteObject[] = [
  {
    path: '',
    element: <EventsHome />,
  },
];
