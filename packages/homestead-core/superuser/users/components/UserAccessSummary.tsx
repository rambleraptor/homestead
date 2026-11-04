import { useMemo } from 'react';
import { KeyRound } from 'lucide-react';
import { getNavigationApps } from '@rambleraptor/homestead-core/apps/registry';
import { isAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { canWith } from '@rambleraptor/homestead-core/permissions/client';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useUserPermissionContext } from '@rambleraptor/homestead-core/permissions/hooks';
import type { ManagedUser } from '../types';

/**
 * A live, read-only summary of what an *existing* user can actually do — the
 * edit-form counterpart to `NewUserAccessPreview`. Where the create-time preview
 * shows the defaults a brand-new user would inherit, this resolves the user's
 * real, effective access (their groups' roles + direct grants + the household
 * everyone-grants) through the same `resolve()` the server enforces with.
 *
 * The context comes from the superuser-only `/api/permissions/user/:id` route,
 * so this only renders inside the (superuser-gated) Users app.
 */

// A resourceType that matches only `all`-scope grants — never a real collection
// — so `canWith` reports household-wide (not per-collection) access.
const ANY_RESOURCE = '__all__';

export function UserAccessSummary({ user }: { user: ManagedUser }) {
  const isSuperuser = user.type === 'superuser';
  const { data: ctx, isLoading, isError, error, refetch } = useUserPermissionContext(user.id);

  // Break-glass access doesn't depend on the fetched context, so a superuser is
  // "loaded" immediately; a regular user needs their resolved grants.
  const loaded = isSuperuser || !!ctx;

  const openableApps = useMemo(() => {
    // Same nesting rule as the nav: a parent (e.g. Games) counts as openable
    // when the user can open any child (e.g. Pictionary).
    return getNavigationApps()
      .filter((app) =>
        isAppVisible(
          app,
          isSuperuser,
          (resourceType, appId) =>
            canWith(ctx, user.id, isSuperuser, 'read', resourceType, { appId }) ||
            // Same fold as the nav: a filtered grant reads as unreachable
            // client-side, so trust the server's row-existence report.
            (ctx?.collectionsWithRows ?? []).includes(resourceType),
        ),
      )
      .map((app) => app.name);
  }, [ctx, user.id, isSuperuser]);

  const dataSummary = useMemo(() => {
    if (isSuperuser) {
      return 'Full access to all household data — superusers bypass every restriction (break-glass).';
    }
    if (!ctx) return null;
    if (!ctx.enforced) {
      return 'Can read and write everything — permissions are not being enforced yet.';
    }
    if (canWith(ctx, user.id, false, 'write', ANY_RESOURCE)) {
      return 'Can read and write all shared household data.';
    }
    if (canWith(ctx, user.id, false, 'read', ANY_RESOURCE)) {
      return 'Can read all shared household data (read-only).';
    }
    return 'Access is limited to specific apps and records — see below.';
  }, [ctx, user.id, isSuperuser]);

  const groupNames = ctx?.groupNames ?? [];

  return (
    <div
      className="rounded-md border border-blue-100 bg-blue-50/40 p-3 space-y-1.5"
      data-testid="user-access-summary"
    >
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-text-main">
          What this {isSuperuser ? 'superuser' : 'user'} can access
        </span>
      </div>

      {isLoading && !isSuperuser ? (
        <p className="text-sm text-text-muted">Loading access…</p>
      ) : !loaded ? (
        isError ? (
          <QueryError
            compact
            error={error}
            onRetry={() => void refetch()}
            title="Couldn’t load access details"
            data-testid="user-access-summary-error"
          />
        ) : (
          <p className="text-sm text-text-muted">Couldn&apos;t load access details.</p>
        )
      ) : (
        <>
          <p className="text-sm text-gray-700">{dataSummary}</p>
          {!isSuperuser && (
            <p className="text-sm text-gray-700">
              {groupNames.length === 0
                ? 'Not in any group.'
                : `In ${groupNames.length === 1 ? 'group' : 'groups'}: ${groupNames.join(', ')}.`}
            </p>
          )}
          <p className="text-sm text-gray-700">
            {openableApps.length === 0
              ? 'Cannot open any apps.'
              : `Can open ${openableApps.length} app${openableApps.length === 1 ? '' : 's'}: ${openableApps.join(', ')}.`}
          </p>
          {!isSuperuser && (
            <p className="text-xs text-text-muted">
              Change this on the Permissions page — add them to a group, or share
              specific apps or records.
            </p>
          )}
        </>
      )}
    </div>
  );
}
