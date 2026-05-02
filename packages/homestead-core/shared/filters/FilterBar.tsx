'use client';

/**
 * Generic filter bar.
 *
 * Reads the module's filter decls + current values from context and
 * renders one input per decl. No props — wire it inside a
 * `<ModuleFiltersProvider>` and it follows the data.
 *
 * Enum chip rows derive their options from the loaded items so modules
 * never need to hand-maintain a static value list.
 */

import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/Checkbox';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import {
  useEnumOptions,
  useModuleFilterDecls,
  useModuleFilterValues,
} from './FiltersContext';
import type { DateRangeValue, ModuleFilterDecl } from './types';

export function FilterBar() {
  const decls = useModuleFilterDecls();
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

function FilterControl({ decl }: { decl: ModuleFilterDecl }) {
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

function TextFilter({ decl }: { decl: ModuleFilterDecl }) {
  const { values, setValue } = useModuleFilterValues();
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

function EnumSingleFilter({ decl }: { decl: ModuleFilterDecl }) {
  const { values, setValue } = useModuleFilterValues();
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

function EnumMultiFilter({ decl }: { decl: ModuleFilterDecl }) {
  const { values, setValue } = useModuleFilterValues();
  const options = useEnumOptions(decl.key);
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

  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium text-text-muted mb-1">{decl.label}</span>
      <div
        data-testid={`filter-enum-multi-${decl.key}`}
        className="flex flex-wrap gap-1"
      >
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              data-testid={`filter-chip-${decl.key}-${opt}`}
              aria-pressed={active}
              className={cn(
                'inline-block px-2 py-0.5 text-xs rounded-full transition-colors',
                active
                  ? 'bg-brand-navy text-white'
                  : 'bg-bg-pearl text-brand-slate hover:bg-gray-200',
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BooleanFilter({ decl }: { decl: ModuleFilterDecl }) {
  const { values, setValue } = useModuleFilterValues();
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

function DateRangeFilter({ decl }: { decl: ModuleFilterDecl }) {
  const { values, setValue } = useModuleFilterValues();
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
