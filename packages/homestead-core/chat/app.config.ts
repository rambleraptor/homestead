/**
 * Chat App Configuration
 *
 * Core app (always installed): a household assistant on the operator's
 * configured AI provider, with one tool per registered aepbase resource (the
 * verb — list/get/create/update/delete or an app's `:custom-method` — is the
 * tool's `action` parameter; see `core/server/chat/per-resource.ts`).
 * The backend lives in `core/server/chat/` behind `POST /api/chat`.
 * Conversations are stored (`./resources`) and run server-side, streamed back
 * to the client (`core/server/chat/turns.ts`).
 */

import type { AppConfig } from '../apps/types';
import { chatResources } from './resources';

export const chatApp: AppConfig = {
  id: 'chat',
  name: 'Chat',
  description: 'Ask the household assistant to look up or change your data',
  resources: chatResources,
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
      {
        path: ':id',
        component: () => import('./components/ChatHome').then((m) => m.ChatHome),
        dynamic: true,
      },
    ],
    placement: 'topbar',
    // Not for someone whose home is the assistant: the home holds their chats.
    topBarVisible: () => import('../dashboard/homeMode'),
    navOrder: 5,
    widgets: [
      {
        id: 'chat-ask',
        label: 'Ask Homestead',
        component: () => import('./components/AskWidget').then((m) => m.AskWidget),
        // Above every app's widget: the way into everything else.
        order: 0,
      },
    ],
  },
};
