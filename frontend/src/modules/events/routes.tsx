import type { RouteObject } from 'react-router-dom';
import { EventsHome } from './components/EventsHome';
import { BulkImport } from './components/BulkImport';

export const eventRoutes: RouteObject[] = [
  {
    path: '',
    element: <EventsHome />,
  },
  {
    path: 'import',
    element: <BulkImport />,
  },
];
