/**
 * Permissions — child of the Superuser app.
 *
 * Surfaces the admin UI for the permissions data model: groups (create, delete,
 * manage membership) and a read-only view of the built-in roles. Sidebar
 * placement is owned by the parent (`superuserApp`). Managing groups/roles is a
 * superuser-only concern, so the route carries the hard `superuser` gate (like
 * the Users app) in addition to the `enabled` flag — a superuser flipping the
 * flag to `'all'` still can't expose it to regular users.
 *
 * The underlying `role` / `group` / `group-membership` / `access-grant`
 * collections are declared centrally (`permissions/resources.ts`) and applied by
 * the schema sync, so this app declares no `resources` of its own.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

export const permissionsApp: AppConfig = {
  id: 'permissions',
  name: 'Permissions',
  description: 'Manage groups and view roles.',
  migrations: [
    {
      id: 'permissions-close-open-default',
      title: 'Retire the open-household grant (closed by default)',
      // Destructive: it deletes a grant. Everyone riding that grant is moved
      // onto the Member role first, so effective access is preserved — but the
      // row itself does not come back.
      destructive: true,
      // `is_default` marked that grant as the suppressible fallback. Nothing is
      // a fallback any more, so the field is gone from the definition — and the
      // engine refuses to drop a populated column without this authorization,
      // which an un-migrated instance's open grant still is.
      drops: [{ resource: 'access-grant', field: 'is_default' }],
      load: () => import('./migrations/close-open-default'),
    },
    {
      // Same handler, second ledger entry — deliberately not a rename (an id is
      // the ledger key and never changes). The entry above shipped with a bug:
      // it demanded a member-role group *before* checking whether anyone
      // actually needed one, so a household whose users all already held a role
      // bailed with the open grant intact — and because that bail merely
      // returned, the ledger recorded `succeeded` and never retried. Those
      // instances have been open ever since and the row above will never run
      // again, so the fixed handler needs a fresh id to get a first pass.
      // Idempotent on every other instance: guard 1 no-ops when the grant is
      // already gone.
      id: 'permissions-close-open-default-recheck',
      title: 'Re-check that the open-household grant is retired',
      destructive: true,
      load: () => import('./migrations/close-open-default'),
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.KeyRound),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/PermissionsHome').then((m) => m.PermissionsHome),
        gates: ['superuser'],
      },
    ],
  },
};
