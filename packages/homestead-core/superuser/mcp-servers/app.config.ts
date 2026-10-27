/**
 * MCP servers — child of the Superuser app for the external MCP servers the
 * household assistant may use (Home Assistant, a calendar, …).
 *
 * Superusers add a server, point it at a credential, check its tools, set a
 * policy per tool and share it with the groups who may use it. Sidebar
 * placement is owned by the parent (`superuserApp`); the route applies the
 * `'superuser'` gate, and the collection is gated in the engine too — see
 * `./resources`.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { mcpServersResources } from './resources';

export const mcpServersApp: AppConfig = {
  id: 'mcp-servers',
  name: 'MCP servers',
  description: 'Connect the assistant to outside services, on a shared household account.',
  resources: mcpServersResources,
  web: {
    icon: () => import('lucide-react').then((m) => m.Plug),
    basePath: '/superuser/mcp-servers',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/McpServersHome').then((m) => m.McpServersHome),
        gates: ['superuser'],
      },
      {
        // An OAuth provider sends the browser back here after a sign-in.
        path: 'oauth-callback',
        component: () => import('./components/OAuthCallback').then((m) => m.OAuthCallback),
        gates: ['superuser'],
      },
    ],
  },
};
