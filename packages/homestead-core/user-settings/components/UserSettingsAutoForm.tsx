/**
 * Auto-generated form for an app's `userSettings` declarations. The
 * Settings page uses this whenever an app declares `userSettings`
 * but doesn't supply a custom `settingsWidget`.
 *
 * Mirrors the `<FlagField>` switch in
 * `superuser/flag-management/components/FlagManagementHome.tsx` so the
 * two pipelines render identical inputs for identical declarations.
 */

import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/Checkbox';
import type { UserSettingDef, UserSettingValue } from '@rambleraptor/homestead-core/apps/types';
import { useUserSettings } from '../hooks/useUserSettings';
import { useUpdateUserSetting } from '../hooks/useUpdateUserSetting';

interface UserSettingsAutoFormProps {
  appId: string;
  defs: Record<string, UserSettingDef>;
}

export function UserSettingsAutoForm({
  appId,
  defs,
}: UserSettingsAutoFormProps) {
  const { values } = useUserSettings();
  const update = useUpdateUserSetting();

  const handleChange = async (key: string, value: UserSettingValue) => {
    try {
      await update.mutateAsync({ appId, key, value });
    } catch (error) {
      // Toast surfaced by the global mutation error handler (queryClient.ts).
    }
  };

  return (
    <div className="space-y-4">
      {Object.entries(defs).map(([key, def]) => (
        <UserSettingField
          key={key}
          appId={appId}
          settingKey={key}
          def={def}
          value={values[appId]?.[key]}
          onChange={(next) => handleChange(key, next)}
          isSaving={update.isPending}
        />
      ))}
    </div>
  );
}

interface UserSettingFieldProps {
  appId: string;
  settingKey: string;
  def: UserSettingDef;
  value: UserSettingValue | undefined;
  onChange: (value: UserSettingValue) => void;
  isSaving: boolean;
}

function UserSettingField({
  appId,
  settingKey,
  def,
  value,
  onChange,
  isSaving,
}: UserSettingFieldProps) {
  const fieldId = `user-setting-${appId}-${settingKey}`;
  const testid = `user-setting-${appId}-${settingKey}`;

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
