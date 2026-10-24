/**
 * Generic filter bar.
 *
 * Reads the app's filter decls + current values from context and
 * renders one input per decl. No props — wire it inside a
 * `<AppFiltersProvider>` and it follows the data.
 *
 * Enum options are derived from the loaded items so apps never need to
 * hand-maintain a static value list.
 */

import { useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Popover } from 'radix-ui';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/Checkbox';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import {
  useEnumOptions,
  useEnumOptionCounts,
  useAppFilterDecls,
  useAppFilterValues,
} from './FiltersContext';
import type { DateRangeValue, AppFilterDecl } from './types';

export function FilterBar() {
  const decls = useAppFilterDecls();
  if (decls.length === 0) return null;

  return (
    <div
      data-testid="filter-bar"
      className="flex flex-wrap items-end gap-4 mb-4"
    >
      {decls.map((decl) => (
        <FilterControl key={decl.key} decl={decl} />
      ))}
    </div>
  );
}

function FilterControl({ decl }: { decl: AppFilterDecl }) {
  switch (decl.type) {
    case 'text':
      return <TextFilter decl={decl} />;
    case 'enum':
      return decl.multi ? (
        <EnumMultiFilter decl={decl} />
      ) : (
        <EnumSingleFilter decl={decl} />
      );
    case 'boolean':
      return <BooleanFilter decl={decl} />;
    case 'dateRange':
      return <DateRangeFilter decl={decl} />;
  }
}

function TextFilter({ decl }: { decl: AppFilterDecl }) {
  const { values, setValue } = useAppFilterValues();
  const current = typeof values[decl.key] === 'string' ? (values[decl.key] as string) : '';
  return (
    <div className="flex flex-col min-w-[200px] flex-1">
      <label
        htmlFor={`filter-${decl.key}`}
        className="text-xs font-medium text-text-muted mb-1"
      >
        {decl.label}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-gray-400" />
        </div>
        <Input
          id={`filter-${decl.key}`}
          type="text"
          value={current}
          onChange={(e) => setValue(decl.key, e.target.value)}
          placeholder={decl.placeholder ?? `Filter by ${decl.label.toLowerCase()}`}
          className="pl-10"
          data-testid={`filter-text-${decl.key}`}
        />
      </div>
    </div>
  );
}

function EnumSingleFilter({ decl }: { decl: AppFilterDecl }) {
  const { values, setValue } = useAppFilterValues();
  const options = useEnumOptions(decl.key);
  const current = typeof values[decl.key] === 'string' ? (values[decl.key] as string) : '';
  return (
    <div className="flex flex-col min-w-[160px]">
      <label
        htmlFor={`filter-${decl.key}`}
        className="text-xs font-medium text-text-muted mb-1"
      >
        {decl.label}
      </label>
      <select
        id={`filter-${decl.key}`}
        value={current}
        onChange={(e) => setValue(decl.key, e.target.value)}
        data-testid={`filter-enum-${decl.key}`}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">Any</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Above this many options the panel grows a search box. */
const SEARCH_THRESHOLD = 8;

/**
 * A multi-select over values grown from the data (tags), so the option list
 * can run to dozens. A chip per option drowned the page above the very list
 * it filters; instead it's one control the size of its neighbours, opening a
 * searchable checklist ordered by how often each value is used.
 */
function EnumMultiFilter({ decl }: { decl: AppFilterDecl }) {
  const { values, setValue } = useAppFilterValues();
  const options = useEnumOptionCounts(decl.key);
  const [query, setQuery] = useState('');
  const raw = values[decl.key];
  const selected = Array.isArray(raw) ? (raw as string[]) : [];

  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    setValue(decl.key, next);
  };

  if (options.length === 0) {
    return (
      <div className="flex flex-col">
        <span className="text-xs font-medium text-text-muted mb-1">{decl.label}</span>
        <span className="text-sm text-text-muted italic">None yet</span>
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((o) => o.value.toLowerCase().includes(needle))
    : options;
  const summary =
    selected.length === 0
      ? 'Any'
      : selected.length <= 2
        ? selected.join(', ')
        : `${selected.length} selected`;

  return (
    <div className="flex flex-col min-w-[160px]">
      <span
        id={`filter-${decl.key}-label`}
        className="text-xs font-medium text-text-muted mb-1"
      >
        {decl.label}
      </span>
      <Popover.Root onOpenChange={(open) => !open && setQuery('')}>
        <Popover.Trigger
          aria-labelledby={`filter-${decl.key}-label filter-enum-multi-${decl.key}`}
          id={`filter-enum-multi-${decl.key}`}
          data-testid={`filter-enum-multi-${decl.key}`}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            selected.length > 0 ? 'text-brand-navy' : 'text-text-muted',
          )}
        >
          <span className="max-w-[12rem] truncate">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            data-testid={`filter-enum-multi-panel-${decl.key}`}
            className="z-50 w-64 rounded-md border border-gray-200 bg-white p-1 shadow-md"
          >
            {options.length > SEARCH_THRESHOLD && (
              <div className="relative p-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${decl.label.toLowerCase()}`}
                  aria-label={`Search ${decl.label.toLowerCase()}`}
                  className="h-8 pl-8"
                  data-testid={`filter-enum-multi-search-${decl.key}`}
                />
              </div>
            )}
            <div className="max-h-64 overflow-y-auto py-1">
              {visible.map(({ value, count }) => {
                const active = selected.includes(value);
                return (
                  <button
                      key={value}
                      type="button"
                      onClick={() => toggle(value)}
                      data-testid={`filter-chip-${decl.key}-${value}`}
                      aria-pressed={active}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-brand-navy hover:bg-bg-pearl"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          active ? 'border-brand-navy bg-brand-navy text-white' : 'border-gray-300',
                        )}
                      >
                        {active && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{value}</span>
                      <span className="text-xs text-text-muted">{count}</span>
                    </button>
                );
              })}
              {visible.length === 0 && (
                <p className="px-2 py-1.5 text-sm text-text-muted">No matches</p>
              )}
            </div>
            {selected.length > 0 && (
              <div className="border-t border-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setValue(decl.key, [])}
                  data-testid={`filter-enum-multi-clear-${decl.key}`}
                  className="w-full rounded px-2 py-1.5 text-left text-sm text-text-muted hover:bg-bg-pearl hover:text-brand-navy"
                >
                  Clear
                </button>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function BooleanFilter({ decl }: { decl: AppFilterDecl }) {
  const { values, setValue } = useAppFilterValues();
  const current = values[decl.key] === true;
  return (
    <div className="flex items-center gap-2 h-9">
      <Checkbox
        id={`filter-${decl.key}`}
        checked={current}
        onCheckedChange={(c) => setValue(decl.key, c ? true : undefined)}
        data-testid={`filter-boolean-${decl.key}`}
      />
      <label
        htmlFor={`filter-${decl.key}`}
        className="text-sm text-brand-navy"
      >
        {decl.label}
      </label>
    </div>
  );
}

function DateRangeFilter({ decl }: { decl: AppFilterDecl }) {
  const { values, setValue } = useAppFilterValues();
  const current = (values[decl.key] as DateRangeValue | undefined) ?? {};
  const update = (patch: Partial<DateRangeValue>) => {
    const next: DateRangeValue = { ...current, ...patch };
    if (!next.start) delete next.start;
    if (!next.end) delete next.end;
    setValue(decl.key, Object.keys(next).length > 0 ? next : undefined);
  };
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium text-text-muted mb-1">{decl.label}</span>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={current.start ?? ''}
          onChange={(e) => update({ start: e.target.value || undefined })}
          data-testid={`filter-daterange-start-${decl.key}`}
        />
        <span className="text-sm text-text-muted">to</span>
        <Input
          type="date"
          value={current.end ?? ''}
          onChange={(e) => update({ end: e.target.value || undefined })}
          data-testid={`filter-daterange-end-${decl.key}`}
        />
      </div>
    </div>
  );
}
