/**
 * Eval cases — child of the Superuser app for the assistant replies people
 * rated. Each is the conversation up to a rated reply, filed by
 * `chat-messages/{id}:rate`; superusers say what the reply should have done and
 * mark it ready for the eval suite, or retire it.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { evalCaseResources } from './resources';

export const evalCasesApp: AppConfig = {
  id: 'eval-cases',
  name: 'Eval cases',
  description: 'Assistant replies people rated, kept as test cases for improving the assistant.',
  resources: evalCaseResources,
  web: {
    icon: () => import('lucide-react').then((m) => m.FlaskConical),
    basePath: '/superuser/eval-cases',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/EvalCasesHome').then((m) => m.EvalCasesHome),
        gates: ['superuser'],
      },
    ],
  },
};
