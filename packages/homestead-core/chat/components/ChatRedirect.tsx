/**
 * `/chat` and `/chat/:id`. Conversations live on the home now, so these
 * addresses — bookmarks, links, home-screen icons from before — open the same
 * conversation there (`/dashboard`, `/dashboard/c/:id`).
 */

import { Navigate } from 'react-router-dom';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { HOME_PATH, homeConversationPath } from '@rambleraptor/homestead-core/dashboard/home';

export function ChatRedirect({ params }: AppRouteProps) {
  const id = params?.id;
  return <Navigate to={id ? homeConversationPath(id) : HOME_PATH} replace />;
}
