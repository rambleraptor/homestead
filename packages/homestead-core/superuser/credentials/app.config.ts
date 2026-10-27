/**
 * Credentials — child of the Superuser app for the secrets Homestead uses on
 * the household's behalf (API keys, tokens).
 *
 * Superusers add, list, replace and delete them; nobody can read a value back
 * (`value` is a `secret` field). Sidebar placement is owned by the parent
 * (`superuserApp`): this app surfaces as a card on the Superuser landing page,
 * and its route applies the `'superuser'` gate. Unlike Operations, the
 * collection is gated in the engine too — see `./resources`.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { credentialsResources } from './resources';

export const credentialsApp: AppConfig = {
  id: 'credentials',
  name: 'Credentials',
  description: 'Store the API keys and tokens Homestead uses. Values are write-only.',
  resources: credentialsResources,
  web: {
    icon: () => import('lucide-react').then((m) => m.KeyRound),
    basePath: '/superuser/credentials',
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/CredentialsHome').then((m) => m.CredentialsHome),
        gates: ['superuser'],
      },
    ],
  },
};
