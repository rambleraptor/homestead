/**
 * Settings App Configuration
 *
 * App for managing user preferences and notification settings.
 * Enables web push notifications and customization options.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

export const settingsApp: AppConfig = {
  id: 'settings',
  name: 'Settings',
  description: 'Manage your preferences and notifications',
  flags: {
    // Which tool surface the built-in MCP server at /api/mcp serves. Lives
    // here rather than in homestead.config.ts so an operator can flip it from
    // Flag Management without a restart — MCP clients pick the new surface up
    // on their next tools/list.
    mcp_tools: {
      type: 'enum',
      label: 'MCP tool surface',
      description:
        'How /api/mcp exposes your data. "resource" gives one tool per resource with ' +
        'the verb as an action parameter (~41 tools, each carrying its own fields) — ' +
        'the right choice for almost every client. "typed" gives four tools per ' +
        'resource plus one per custom method (richest schemas, but ~167 tools). ' +
        '"generic" collapses everything to six tools that take the resource as a ' +
        'parameter, for clients whose context you want back.',
      options: ['resource', 'typed', 'generic'],
      // Must match the route's own fallback for an unset flag — see
      // `toolMode` in homestead-server/src/routes/mcp.ts.
      default: 'resource',
    },
  },
  web: {
    icon: () => import('lucide-react').then((m) => m.Settings),
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/SettingsHome').then((m) => m.SettingsHome),
      },
    ],
    section: 'Settings',
    showInNav: true,
    navOrder: 100,
  },
};
