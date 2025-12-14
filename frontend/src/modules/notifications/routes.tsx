import type { RouteObject } from 'react-router-dom';
import { NotificationsHome } from './components/NotificationsHome';

export const notificationRoutes: RouteObject[] = [
  {
    index: true,
    element: <NotificationsHome />,
  },
];
