/**
 * Resource-reference form field.
 *
 * A searchable combobox for choosing one or more records of *any* aepbase
 * collection to store in a `reference` field, wrapped in the chrome a form
 * needs: an optional label, required marker, help text, and error line.
 * Selections are held as `{collection}/{id}` paths (the shape the engine
 * expects for a reference), so the field is agnostic about which resource it
 * points at — pass the plural collection name and, if the display field isn't
 * `name`, a `labelField`.
 *
 * Options live in a dropdown that opens on focus and filters as you type, so
 * the full record list is never dumped inline. Set `multiple` for a to-many
 * reference; the default is single-select. Omit `label` to render just the
 * picker (e.g. inside a custom field layout).
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Star, X } from 'lucide-react';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { QueryError } from './QueryError';

interface ReferenceRecord {
  id: string;
  [key: string]: unknown;
}

export interface ReferenceFieldProps {
  /** Plural collection to reference, e.g. `people`. Also the path prefix. */
  collection: string;
  /** Selected `{collection}/{id}` paths. Single-select uses a 0-or-1 array. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Record field to show as the label. Defaults to `name`. */
  labelField?: string;
  /** Allow more than one selection (to-many reference). */
  multiple?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  id?: string;
  disabled?: boolean;
  /**
   * Test id prefix. The search input renders as `${testId}-input`, each
   * option as `${testId}-option-${id}`, each selected chip's remove button as
   * `${testId}-remove-${id}`, and (when `onToggleFavorite` is set) each option's
   * star toggle as `${testId}-star-${id}`.
   */
  testId?: string;

  // ---- favorites (optional) ---------------------------------------------
  /** Bare record ids to float to the top of the option list, marked with a
   *  star. Omit to keep plain alphabetical ordering. */
  favoriteIds?: Set<string>;
  /** When provided, each option shows a star toggle that stars/unstars that
   *  record (by bare id) without selecting it. */
  onToggleFavorite?: (id: string) => void;

  // ---- form-field chrome ------------------------------------------------
  /** Field label shown above the picker. Omit for a bare picker. */
  label?: string;
  /** Show the required marker and mark the control required for a11y. */
  required?: boolean;
  /** Optional help text rendered under the label. */
  description?: string;
  /** Validation error rendered under the picker. */
  error?: string;
}

export function ReferenceField({
  collection,
  value,
  onChange,
  labelField = 'name',
  multiple = false,
  placeholder = 'Search…',
  emptyMessage = 'No matches',
  id,
  disabled = false,
  testId,
  label,
  required = false,
  description,
  error,
  favoriteIds,
  onToggleFavorite,
}: ReferenceFieldProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    data: records,
    isLoading,
    isError,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: ['reference-select', collection],
    queryFn: () => aepbase.list<ReferenceRecord>(collection),
  });

  const labelFor = (record: ReferenceRecord): string => {
    const raw = record[labelField];
    return typeof raw === 'string' && raw ? raw : record.id;
  };

  // Path -> label, for rendering the selected chips.
  const labelByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of records ?? []) {
      map.set(`${collection}/${record.id}`, labelFor(record));
    }
    return map;
    // labelFor is a stable pure fn of labelField; deps kept minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, collection, labelField]);

  // Unselected records whose label matches the query. Starred records sort
  // ahead of the rest; both groups stay alphabetical within themselves.
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rank = (record: ReferenceRecord) => (favoriteIds?.has(record.id) ? 0 : 1);
    return (records ?? [])
      .filter((record) => !value.includes(`${collection}/${record.id}`))
      .filter((record) => (q ? labelFor(record).toLowerCase().includes(q) : true))
      .sort((a, b) => rank(a) - rank(b) || labelFor(a).localeCompare(labelFor(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, value, query, collection, labelField, favoriteIds]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (activeIndex >= options.length) setActiveIndex(0);
  }, [options.length, activeIndex]);

  const select = (path: string) => {
    onChange(multiple ? [...value, path] : [path]);
    setQuery('');
    setActiveIndex(0);
    if (!multiple) setOpen(false);
  };

  const remove = (path: string) => onChange(value.filter((p) => p !== path));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && options[activeIndex]) {
        e.preventDefault();
        select(`${collection}/${options[activeIndex].id}`);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && query === '' && value.length > 0) {
      remove(value[value.length - 1]);
    }
  };

  // In single-select mode a made selection collapses the input into a chip.
  const showInput = multiple || value.length === 0;
  const describedBy = description && id ? `${id}-description` : undefined;
  const errorId = error && id ? `${id}-error` : undefined;

  return (
    <div>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {description && (
        <p id={describedBy} className="text-sm text-text-muted mb-1">
          {description}
        </p>
      )}

      <div ref={containerRef} className="relative w-full">
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-300 bg-surface-white px-2 py-1.5 focus-within:ring-2 focus-within:ring-accent-terracotta focus-within:border-accent-terracotta"
          onClick={() => !disabled && setOpen(true)}
        >
          {value.map((path) => (
            <span
              key={path}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-sm text-gray-800"
            >
              {labelByPath.get(path) ?? path}
              <button
                type="button"
                onClick={() => remove(path)}
                disabled={disabled}
                aria-label={`Remove ${labelByPath.get(path) ?? path}`}
                className="rounded-full p-0.5 hover:bg-gray-200 disabled:opacity-50"
                data-testid={testId ? `${testId}-remove-${path.split('/').pop()}` : undefined}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {showInput && (
            <input
              id={id}
              type="text"
              value={query}
              disabled={disabled}
              required={required && value.length === 0}
              aria-describedby={describedBy}
              aria-invalid={error ? true : undefined}
              aria-errormessage={errorId}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={value.length === 0 ? placeholder : ''}
              role="combobox"
              aria-expanded={open}
              aria-controls={id ? `${id}-listbox` : undefined}
              autoComplete="off"
              className="h-7 min-w-[8rem] flex-1 border-0 px-1 text-sm focus:outline-none focus:ring-0"
              data-testid={testId ? `${testId}-input` : undefined}
            />
          )}
          <ChevronDown className="ml-auto h-4 w-4 flex-shrink-0 text-gray-400" />
        </div>

        {open && !disabled && (
          <ul
            id={id ? `${id}-listbox` : undefined}
            role="listbox"
            className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-surface-white py-1 shadow-lg"
          >
            {isLoading ? (
              <li className="px-3 py-2 text-sm text-text-muted">Loading…</li>
            ) : isError ? (
              <li className="px-2 py-1">
                <QueryError
                  compact
                  error={loadError}
                  onRetry={() => void refetch()}
                  title="Couldn’t load the options"
                  data-testid={testId ? `${testId}-error` : undefined}
                />
              </li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-text-muted">{emptyMessage}</li>
            ) : (
              options.map((record, index) => {
                const path = `${collection}/${record.id}`;
                const starred = favoriteIds?.has(record.id) ?? false;
                return (
                  <li
                    key={record.id}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`flex items-center ${
                      index === activeIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => select(path)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className="flex-1 px-3 py-2 text-left text-sm"
                      data-testid={testId ? `${testId}-option-${record.id}` : undefined}
                    >
                      {labelFor(record)}
                    </button>
                    {onToggleFavorite && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(record.id);
                        }}
                        onMouseEnter={() => setActiveIndex(index)}
                        aria-pressed={starred}
                        aria-label={`${starred ? 'Unstar' : 'Star'} ${labelFor(record)}`}
                        className="px-2 py-2 text-gray-300 hover:text-amber-500"
                        data-testid={testId ? `${testId}-star-${record.id}` : undefined}
                      >
                        <Star
                          className={`h-4 w-4 ${starred ? 'fill-amber-400 text-amber-400' : ''}`}
                        />
                      </button>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
