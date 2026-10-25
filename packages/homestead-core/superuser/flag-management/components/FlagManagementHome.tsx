import { useEffect } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/Checkbox';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { syncAppFlagsSchema } from '@rambleraptor/homestead-core/app-flags/sync';
import {
  getAllAppFlagDefs,
  getAppById,
} from '@rambleraptor/homestead-core/apps/registry';
import { useAppFlags } from '@rambleraptor/homestead-core/settings/hooks/useAppFlags';
import { useUpdateAppFlag } from '@rambleraptor/homestead-core/settings/hooks/useUpdateAppFlag';
import {
  unflatten,
  unflattenAudiences,
  type FlagAudience,
} from '@rambleraptor/homestead-core/settings/flags';
import { useGroups } from '@rambleraptor/homestead-core/permissions/hooks';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import {
  APP_FLAGS_DEFINITION_QUERY_KEY,
  useAppFlagsDefinition,
} from '../hooks/useAppFlagsDefinition';
import type { AppFlagDef, AppFlagValue } from '@rambleraptor/homestead-core/apps/types';

export function FlagManagementHome() {
  const { defs, isLoading: defsLoading, isMissing } = useAppFlagsDefinition();
  const { record, isLoading: valuesLoading } = useAppFlags();
  const values = unflatten(record, defs);
  const audiences = unflattenAudiences(record, defs);
  const update = useUpdateAppFlag();
  const queryClient = useQueryClient();
  const toast = useToast();

  // If aepbase has no `app-flag` resource definition yet (e.g. the
  // Next.js instrumentation hook skipped the sync because the admin env
  // vars weren't set), register it on page load using the superuser's
  // own token. This page is superuser-gated so the token has the
  // permissions required.
  useEffect(() => {
    if (!isMissing) return;
    let cancelled = false;
    (async () => {
      try {
        await syncAppFlagsSchema({
          aepbaseUrl: '/api/aep',
          token: aepbase.authStore.token,
          defs: getAllAppFlagDefs(),
        });
        if (cancelled) return;
        await queryClient.invalidateQueries({
          queryKey: APP_FLAGS_DEFINITION_QUERY_KEY,
        });
      } catch (error) {
        // Not a mutation, so nothing else reports it: a superuser who lands
        // here and sees no flags should be told why.
        if (!cancelled) toast.error(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMissing, queryClient, toast]);

  const handleChange = async (
    appId: string,
    key: string,
    value: AppFlagValue,
  ) => {
    try {
      await update.mutateAsync({ appId, key, value });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };
  const handleAudience = async (appId: string, key: string, audience: FlagAudience) => {
    try {
      await update.mutateAsync({ appId, key, audience });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const isLoading = defsLoading || valuesLoading;
  const appIds = Object.keys(defs);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flag Management"
        subtitle="View and edit every app flag registered in aepbase."
      />

      {isLoading ? (
        <Card>
          <div className="flex items-center gap-3 py-4">
            <Spinner size="sm" />
            <span className="text-sm text-gray-600">Loading flags…</span>
          </div>
        </Card>
      ) : appIds.length === 0 ? (
        <Card>
          <p className="text-center text-gray-600 py-8">
            No app flags are registered in aepbase yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-4" data-testid="flag-management-list">
          {appIds.map((appId) => {
            const appDefs = defs[appId];
            const mod = getAppById(appId);
            const appName = mod?.name ?? appId;
            return (
              <Card key={appId}>
                <div className="flex items-start gap-4">
                  <SlidersHorizontal className="w-6 h-6 text-blue-500 mt-1" />
                  <div className="flex-1 space-y-4">
                    <h3
                      className="font-semibold text-gray-900"
                      data-testid={`flag-app-${appId}`}
                    >
                      {appName}
                    </h3>
                    {Object.entries(appDefs).map(([key, def]) => {
                      return (
                        <div key={key} className="space-y-2">
                          <FlagField
                            appId={appId}
                            flagKey={key}
                            def={def}
                            value={values[appId]?.[key]}
                            onChange={(next) =>
                              handleChange(appId, key, next)
                            }
                            isSaving={update.isPending}
                          />
                          <AudienceField
                            appId={appId}
                            flagKey={key}
                            audience={audiences[appId]?.[key] ?? 'everyone'}
                            onChange={(next) => handleAudience(appId, key, next)}
                            isSaving={update.isPending}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface FlagFieldProps {
  appId: string;
  flagKey: string;
  def: AppFlagDef;
  value: AppFlagValue | undefined;
  onChange: (value: AppFlagValue) => void;
  isSaving: boolean;
}

function FlagField({
  appId,
  flagKey,
  def,
  value,
  onChange,
  isSaving,
}: FlagFieldProps) {
  const fieldId = `flag-${appId}-${flagKey}`;
  const testid = `flag-${appId}-${flagKey}`;

  switch (def.type) {
    case 'string':
      return (
        <div>
          <Input
            id={fieldId}
            label={def.label}
            value={(value as string | undefined) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isSaving}
            data-testid={testid}
          />
          <p className="mt-1 text-xs text-gray-500">{def.description}</p>
        </div>
      );

    case 'number':
      return (
        <div>
          <Input
            id={fieldId}
            label={def.label}
            type="number"
            value={value === undefined ? '' : String(value)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(n);
            }}
            disabled={isSaving}
            data-testid={testid}
          />
          <p className="mt-1 text-xs text-gray-500">{def.description}</p>
        </div>
      );

    case 'boolean':
      return (
        <div className="flex items-start gap-3">
          <Checkbox
            id={fieldId}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(Boolean(checked))}
            disabled={isSaving}
            data-testid={testid}
          />
          <div>
            <label
              htmlFor={fieldId}
              className="text-sm font-medium text-gray-900 cursor-pointer"
            >
              {def.label}
            </label>
            <p className="text-xs text-gray-500">{def.description}</p>
          </div>
        </div>
      );

    case 'enum':
      return (
        <div>
          <label
            htmlFor={fieldId}
            className="block text-sm font-medium text-gray-900 mb-2"
          >
            {def.label}
          </label>
          <select
            id={fieldId}
            value={(value as string | undefined) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={isSaving}
            data-testid={testid}
            className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            {def.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">{def.description}</p>
        </div>
      );
  }
}

interface AudienceFieldProps {
  appId: string;
  flagKey: string;
  audience: FlagAudience;
  onChange: (audience: FlagAudience) => void;
  isSaving: boolean;
}

/**
 * Who a flag's value applies to: everyone, nobody, or the members of chosen
 * groups. Outside the audience a flag reads as its default, so this is how a
 * change is tried on a "Beta" group before the whole household.
 */
function AudienceField({ appId, flagKey, audience, onChange, isSaving }: AudienceFieldProps) {
  const groups = useGroups();
  const testid = `flag-${appId}-${flagKey}-audience`;
  const mode = audience === 'everyone' ? 'everyone' : audience.length === 0 ? 'nobody' : 'groups';
  const chosen = audience === 'everyone' ? [] : audience;
  const known = [...(groups.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  // A chosen id whose group has since been deleted: shown so it can be unticked.
  const removed = chosen.filter((id) => !known.some((g) => g.id === id));
  const toggle = (id: string, on: boolean) =>
    onChange(on ? [...chosen, id] : chosen.filter((g) => g !== id));

  return (
    <div className="ml-7 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-600">
      <label htmlFor={testid}>Applies to</label>
      <select
        id={testid}
        value={mode}
        disabled={isSaving || groups.isPending}
        data-testid={testid}
        onChange={(e) => {
          const next = e.target.value;
          if (next === 'everyone') onChange('everyone');
          else if (next === 'nobody') onChange([]);
          // "These groups" starts with the first group, so it never silently means nobody.
          else onChange(chosen.length > 0 ? chosen : known.slice(0, 1).map((g) => g.id));
        }}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      >
        <option value="everyone">everyone</option>
        <option value="groups" disabled={known.length === 0}>
          these groups
        </option>
        <option value="nobody">nobody</option>
      </select>
      {known.length === 0 && !groups.isPending && (
        <span className="text-gray-400">No groups yet — make one under Permissions.</span>
      )}
      {mode === 'groups' &&
        known.map((group) => {
          const id = `${testid}-${group.name}`;
          return (
            <label key={group.id} htmlFor={id} className="flex items-center gap-1.5">
              <Checkbox
                id={id}
                checked={chosen.includes(group.id)}
                disabled={isSaving}
                data-testid={id}
                onCheckedChange={(checked) => toggle(group.id, checked === true)}
              />
              {group.name}
            </label>
          );
        })}
      {mode === 'groups' &&
        removed.map((id) => (
          <label key={id} className="flex items-center gap-1.5 text-gray-400">
            <Checkbox checked disabled={isSaving} onCheckedChange={() => toggle(id, false)} />
            {id} (removed)
          </label>
        ))}
    </div>
  );
}
