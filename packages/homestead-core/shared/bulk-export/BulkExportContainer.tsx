/**
 * The standardized bulk-export screen.
 *
 * A dedicated page (mirroring the bulk-import page) where the user picks which
 * records to export, instead of permanent checkboxes cluttering the app's list.
 * It's fully generic — it fetches the resource's records itself and renders a
 * searchable checkbox list keyed by a label, so it needs none of the app's list
 * or item components. Nothing selected exports everything; a selection exports
 * exactly those records via an `id in [...]` filter.
 *
 * ```tsx
 * // people/bulk-export/index.tsx — wired via an `export` route in app.config.ts
 * export function PeopleBulkExport() {
 *   return (
 *     <BulkExportContainer
 *       config={{ plural: 'people', appName: 'People', appNamePlural: 'people', backRoute: '/people' }}
 *     />
 *   );
 * }
 * ```
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileDown, SearchX } from 'lucide-react';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/Checkbox';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useRowSelection } from '@rambleraptor/homestead-core/shared/hooks/useRowSelection';
import { BulkExportButton } from './BulkExportButton';
import { selectionFilter, useBulkExportOptions } from './useBulkExport';
import { defaultLabel, type BulkExportPageConfig, type BulkExportRecord } from './types';

interface BulkExportContainerProps {
  config: BulkExportPageConfig;
}

export function BulkExportContainer({ config }: BulkExportContainerProps) {
  const { plural, appName, appNamePlural, backRoute } = config;
  const label = config.label ?? defaultLabel;

  const recordsQuery = useQuery({
    queryKey: ['bulk-export', 'records', plural],
    queryFn: () => aepbase.list<BulkExportRecord>(plural),
  });
  const records = useMemo(() => recordsQuery.data ?? [], [recordsQuery.data]);

  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => label(r).toLowerCase().includes(q));
  }, [records, search, label]);

  const selection = useRowSelection(visible.map((r) => r.id));
  const count = selection.count;

  // Declared export toggles (e.g. "combine households"). We store only the
  // user's overrides; the effective value falls back to each option's default.
  const options = useBulkExportOptions(plural).data ?? [];
  const [optionOverrides, setOptionOverrides] = useState<Record<string, boolean>>({});
  const optionValues = useMemo(
    () =>
      Object.fromEntries(
        options.map((o) => [o.id, optionOverrides[o.id] ?? o.default ?? false]),
      ),
    [options, optionOverrides],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to={backRoute}
          className="inline-flex items-center text-sm text-text-muted hover:text-brand-navy"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-navy tracking-tight">
            Export {appName}
          </h1>
          <p className="text-base font-body text-text-muted mt-1">
            {count > 0
              ? `${count} selected`
              : `Select records to export, or export all ${appNamePlural}.`}
          </p>
        </div>
        <BulkExportButton
          plural={plural}
          variant="primary"
          filter={count > 0 ? selectionFilter(selection.selectedIds) : undefined}
          options={optionValues}
          label={count > 0 ? `Export ${count} selected` : `Export all ${appNamePlural}`}
        />
      </div>

      {options.length > 0 && (
        <fieldset className="rounded-md border border-border p-3 space-y-2">
          <legend className="px-1 text-sm font-medium text-text-muted">Options</legend>
          {options.map((option) => (
            <label key={option.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={optionValues[option.id]}
                onCheckedChange={(on) =>
                  setOptionOverrides((prev) => ({ ...prev, [option.id]: on }))
                }
                data-testid={`export-option-${option.id}`}
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </fieldset>
      )}

      {recordsQuery.isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      ) : recordsQuery.isError ? (
        <QueryError
          error={recordsQuery.error}
          onRetry={() => void recordsQuery.refetch()}
          title={`Couldn’t load ${appNamePlural}`}
          data-testid="export-error"
        />
      ) : records.length === 0 ? (
        <EmptyState
          icon={FileDown}
          title={`No ${appNamePlural} to export yet`}
          description={`Once you add ${appNamePlural}, you can export them from here.`}
          data-testid="export-empty"
        />
      ) : (
        <>
          <Input
            type="search"
            placeholder={`Search ${appNamePlural}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={`Search ${appNamePlural}`}
            data-testid="export-search"
          />

          <div className="flex items-center gap-3 min-h-9">
            <Checkbox
              checked={
                selection.allVisibleSelected
                  ? true
                  : selection.someVisibleSelected
                    ? 'indeterminate'
                    : false
              }
              onCheckedChange={selection.toggleAllVisible}
              aria-label={`Select all ${appNamePlural}`}
              data-testid="export-select-all"
            />
            <span className="text-sm text-text-muted">
              {count > 0 ? `${count} selected` : 'Select all'}
            </span>
            {count > 0 && (
              <Button variant="secondary" size="sm" onClick={selection.clear}>
                Clear
              </Button>
            )}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              title={`No ${appNamePlural} match “${search}”`}
              description="Try a different search."
              data-testid="export-no-matches"
            />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {visible.map((record) => (
                <li key={record.id}>
                  <label className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-accent">
                    <Checkbox
                      checked={selection.isSelected(record.id)}
                      onCheckedChange={(on) => selection.set(record.id, on)}
                      data-testid="export-row-checkbox"
                    />
                    <span className="text-sm">{label(record)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
