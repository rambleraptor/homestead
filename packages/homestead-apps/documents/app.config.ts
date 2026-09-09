/**
 * Documents App Configuration
 *
 * Stores household documents — the file plus whatever metadata the AI can parse
 * out of it. Document types are declared as static TypeScript modules (see
 * `doc-types/`), so the resource schema is fully known at import time.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { documentsResources } from './resources';

export const documentsApp: AppConfig = {
  id: 'documents',
  name: 'Documents',
  description: 'Store documents and parse their details automatically',
  resources: documentsResources,
  // Pull documents out of incoming email every 5 minutes — PDF and important
  // image attachments, or the message body itself (receipts) when there are
  // none. No-ops when no email provider is configured. The handler lives under
  // `crons/` so it's stubbed out of the browser bundle; the import stays lazy.
  crons: [
    {
      id: 'documents-ingest-email',
      title: 'Ingest email documents',
      intervalSeconds: 300,
      load: () => import('./crons/ingest-email'),
    },
  ],
  // Seed the new `document.people` link from the names each document already
  // extracted, so a person's detail page has documents on day one. One-shot and
  // idempotent (skips documents already linked).
  migrations: [
    {
      id: 'documents-backfill-people',
      title: 'Backfill document people from extracted names',
      load: () => import('./migrations/backfill-people'),
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.FileText),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/DocumentsHome').then((m) => m.DocumentsHome),
      },
      // Before `:id`, which would otherwise match "types" as a document id.
      {
        path: 'types',
        component: () =>
          import('./components/DocumentTypes').then((m) => m.DocumentTypes),
      },
      {
        path: ':id',
        component: () =>
          import('./components/DocumentDetailRoute').then((m) => m.DocumentDetailRoute),
        dynamic: true,
      },
    ],
    section: 'Home',
    showInNav: true,
    navOrder: 5,
  },
};
