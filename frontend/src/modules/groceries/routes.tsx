/**
 * Groceries Module Routes
 */

import type { RouteObject } from 'react-router-dom';
import { GroceriesHome } from './components/GroceriesHome';

export const groceriesRoutes: RouteObject[] = [
  {
    index: true,
    element: <GroceriesHome />,
  },
];
