import type { RouteObject } from 'react-router-dom';
import { SettingsHome } from './components/SettingsHome';

export const settingsRoutes: RouteObject[] = [
  {
    path: '',
    element: <SettingsHome />,
  },
];
