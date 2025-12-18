/**
 * Gift Cards Module Routes
 */

import type { RouteObject } from 'react-router-dom';
import { GiftCardHome } from './components/GiftCardHome';
import { GiftCardsBulkImport } from './bulk-import';

export const giftCardRoutes: RouteObject[] = [
  {
    index: true,
    element: <GiftCardHome />,
  },
  {
    path: 'import',
    element: <GiftCardsBulkImport />,
  },
];
