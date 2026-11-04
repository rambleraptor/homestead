import { useMemo } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { getNavigationApps } from '@rambleraptor/homestead-core/apps/registry';
import { isSuperuserOnlyApp } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { useAccessGrants } from '@rambleraptor/homestead-core/permissions/hooks';
import type { UserType } from '@rambleraptor/homestead-core/auth/types';

function summarizeEveryoneGrant(g: {
  target_scope: string;
  target_app?: string;
  resource_type?: string;
  capability: string;
}): string | null {
  if (g.target_scope === 'all') return `${g.capability} everything`;
  if (g.target_scope === 'app') return `${g.capability} the ${g.target_app} app`;
  if (g.target_scope === 'collection') return `${g.capability} ${g.resource_type} records`;
  return null; // record-scope everyone grants aren't meaningful here
}

/**
 * A live, read-only preview of what a *brand-new* user (before you add them to
 * any group) will be able to do, shown in the create-user form. Two layers,
 * reported honestly:
 *   - **Apps** — app-access gating always applies, regardless of enforcement.
 *   - **Data** — when permissions aren't enforced, everyone can do everything;
 *     when they are, a new user's data access comes entirely from whatever
 *     `everyone`-scoped grants the household has chosen to create.
 *
 * A household starts **closed** — nothing is seeded, so on a fresh instance
 * there are no `everyone` grants and the honest answer is "nothing yet". That is
 * the point of showing this at all: the admin is meant to see the emptiness and
 * pick an access level. If they have since shared something with everyone, this
 * reports that instead, so the preview always describes the household in front
 * of them rather than a default that may not apply.
 *
 * Superusers get a full-access note (they break-glass past data restrictions),
 * with the caveat that app visibility still gates which apps they can open.
 */
export function NewUserAccessPreview({ type }: { type: UserType }) {
  const { user } = useAuth();
  const { data: grants } = useAccessGrants();
  const isSuperuser = type === 'superuser';
  const enforced = user?.permissions?.enforced ?? false;

  // Nav apps a new user would see: superuser-only apps are hidden from regular
  // users; every other app is visible (data access is summarized separately).
  const openableApps = useMemo(() => {
    return getNavigationApps()
      .filter((app) => isSuperuser || !isSuperuserOnlyApp(app))
      .map((app) => app.name);
  }, [isSuperuser]);

  const dataSummary = useMemo(() => {
    if (isSuperuser) {
      return 'Full access to all household data — superusers bypass every restriction (break-glass).';
    }
    if (!enforced) {
      return 'Can read and write everything — permissions are not being enforced yet.';
    }
    const everyoneAllows = (grants ?? []).filter(
      (g) => g.subject_type === 'everyone' && g.effect !== 'deny',
    );
    if (everyoneAllows.some((g) => g.target_scope === 'all')) {
      const cap = everyoneAllows.find((g) => g.target_scope === 'all')!.capability;
      return cap === 'read'
        ? 'Can read all shared household data (but not change it) by default.'
        : 'Can read and write all shared household data by default.';
    }
    const parts = everyoneAllows
      .map(summarizeEveryoneGrant)
      .filter((s): s is string => s !== null);
    if (parts.length > 0) {
      return `Shared with everyone by default: ${parts.join(', ')}.`;
    }
    return 'No data access yet — pick an access level below, or share specific groups or records with them later.';
  }, [isSuperuser, enforced, grants]);

  return (
    <div
      className="rounded-md border border-blue-100 bg-blue-50/40 p-3 space-y-1.5"
      data-testid="new-user-access-preview"
    >
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-medium text-text-main">
          What this {isSuperuser ? 'superuser' : 'user'} will be able to access
        </span>
      </div>
      <p className="text-sm text-gray-700">{dataSummary}</p>
      <p className="text-sm text-gray-700">
        {openableApps.length === 0
          ? 'Cannot open any apps yet.'
          : `Can open ${openableApps.length} app${openableApps.length === 1 ? '' : 's'}: ${openableApps.join(', ')}.`}
      </p>
      {!isSuperuser && (
        <p className="text-xs text-text-muted">
          Access comes from the role their group confers — add them to a group on
          the Permissions page to grant it.
        </p>
      )}
    </div>
  );
}
