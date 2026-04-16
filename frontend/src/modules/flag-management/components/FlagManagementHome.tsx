'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Input } from '@/shared/components/Input';
import { Checkbox } from '@/shared/components/Checkbox';
import { Spinner } from '@/shared/components/Spinner';
import { PageHeader } from '@/shared/components/PageHeader';
import { useToast } from '@/shared/components/ToastProvider';
import { getAllModuleFlagDefs, getModuleById } from '@/modules/registry';
import { useModuleFlags } from '@/modules/settings/hooks/useModuleFlags';
import { useUpdateModuleFlag } from '@/modules/settings/hooks/useUpdateModuleFlag';
import { logger } from '@/core/utils/logger';
import type { ModuleFlagDef, ModuleFlagValue } from '@/modules/types';

export function FlagManagementHome() {
  const defs = getAllModuleFlagDefs();
  const { values, isLoading } = useModuleFlags();
  const update = useUpdateModuleFlag();
  const toast = useToast();

  const handleChange = async (
    moduleId: string,
    key: string,
    value: ModuleFlagValue,
  ) => {
    try {
      await update.mutateAsync({ moduleId, key, value });
    } catch (error) {
      logger.error('Failed to update module flag', error);
      toast.error('Failed to save flag. Please try again.');
    }
  };

  const moduleIds = Object.keys(defs);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Flag Management"
        subtitle="View and edit every module flag declared in the app."
      />

      {isLoading ? (
        <Card>
          <div className="flex items-center gap-3 py-4">
            <Spinner size="sm" />
            <span className="text-sm text-gray-600">Loading flags…</span>
          </div>
        </Card>
      ) : moduleIds.length === 0 ? (
        <Card>
          <p className="text-center text-gray-600 py-8">
            No modules have declared any flags yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-4" data-testid="flag-management-list">
          {moduleIds.map((moduleId) => {
            const moduleDefs = defs[moduleId];
            const mod = getModuleById(moduleId);
            const moduleName = mod?.name ?? moduleId;
            return (
              <Card key={moduleId}>
                <div className="flex items-start gap-4">
                  <SlidersHorizontal className="w-6 h-6 text-blue-500 mt-1" />
                  <div className="flex-1 space-y-4">
                    <h3
                      className="font-semibold text-gray-900"
                      data-testid={`flag-module-${moduleId}`}
                    >
                      {moduleName}
                    </h3>
                    {Object.entries(moduleDefs).map(([key, def]) => (
                      <FlagField
                        key={key}
                        moduleId={moduleId}
                        flagKey={key}
                        def={def}
                        value={values[moduleId]?.[key]}
                        onChange={(next) => handleChange(moduleId, key, next)}
                        isSaving={update.isPending}
                      />
                    ))}
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
  moduleId: string;
  flagKey: string;
  def: ModuleFlagDef;
  value: ModuleFlagValue | undefined;
  onChange: (value: ModuleFlagValue) => void;
  isSaving: boolean;
}

function FlagField({
  moduleId,
  flagKey,
  def,
  value,
  onChange,
  isSaving,
}: FlagFieldProps) {
  const fieldId = `flag-${moduleId}-${flagKey}`;
  const testid = `flag-${moduleId}-${flagKey}`;

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
