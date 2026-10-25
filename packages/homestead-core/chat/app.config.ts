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
 *
 * Its conversations are held on the home (`dashboard`), so it has no screen of
 * its own: `/chat` addresses redirect there, and it stays out of navigation.
 * It is still an app — its collections gate who can use the assistant.
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
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/ChatRedirect').then((m) => m.ChatRedirect),
      },
      {
        path: ':id',
        component: () => import('./components/ChatRedirect').then((m) => m.ChatRedirect),
        dynamic: true,
      },
    ],
    showInNav: false,
  },
};
