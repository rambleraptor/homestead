import type { RouteObject } from 'react-router-dom';
import { EventsHome } from './components/EventsHome';
import { EventsBulkImport } from './bulk-import';

export const eventRoutes: RouteObject[] = [
  {
    index: true,
    element: <EventsHome />,
  },
  {
    path: 'import',
    element: <EventsBulkImport />,
  },
];
