/**
 * Chat App Configuration
 *
 * Core app (always installed): a household assistant on the operator's
 * configured AI provider, with one tool per registered aepbase resource (the
 * verb — list/get/create/update/delete or an app's `:custom-method` — is the
 * tool's `action` parameter; see `core/server/chat/per-resource.ts`).
 * The backend lives in `core/server/chat/` behind `POST /api/chat`;
 * conversations are ephemeral (client state only).
 */

import type { AppConfig } from '../apps/types';

export const chatApp: AppConfig = {
  id: 'chat',
  name: 'Chat',
  description: 'Ask the household assistant to look up or change your data',
  web: {
    icon: () => import('lucide-react').then((m) => m.MessageCircle),
    basePath: '/chat',
    homeScreenIcon: '/app-icons/chat.png',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/ChatHome').then((m) => m.ChatHome),
      },
    ],
    placement: 'topbar',
    navOrder: 5,
  },
};
