/**
 * Receipt Vault
 *
 * The list both tabs render: a full table on `md+` screens and a stacked card
 * list on phones, so nothing overflows horizontally. The two layouts
 * deliberately use different accessible names on their action buttons, so a
 * single control matches per viewport — the callers that build the cells keep
 * that up.
 *
 * Generic over the row type: a tab supplies its own columns, its own mobile
 * card, and its own filter controls. What's shared is the chrome — header,
 * empty state, the responsive split, and the footer that totals whatever the
 * filters left showing.
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { formatCurrency } from '@rambleraptor/homestead-core/shared/utils/currencyUtils';

export interface VaultColumn<T> {
  key: string;
  /** Empty for a column that needs no header, e.g. the thumbnail. */
  header: string;
  align?: 'left' | 'right';
  /** Extra classes for both the `th` and its `td`s (widths, nowrap). */
  headerClassName?: string;
  cellClassName?: string;
  cell: (row: T) => ReactNode;
}

interface ReceiptVaultProps<T> {
  title: string;
  icon: LucideIcon;
  /** Filter controls, rendered in the header. */
  filters?: ReactNode;
  columns: VaultColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** The row's phone layout, rendered inside the list item. */
  mobileCard: (row: T) => ReactNode;
  /** What the footer totals — the deductible, the amount, whatever the tab means. */
  amountOf: (row: T) => number;
  /** Shown when `rows` is empty. Kept as copy so each tab can name its own thing. */
  emptyMessage: string;
  /** Offered alongside the empty message when a filter is what emptied the list. */
  filtersActive?: boolean;
  onClearFilters?: () => void;
  /** Marks the section, so a test can scope "is this row listed" to the list. */
  testId?: string;
}

export function ReceiptVault<T>({
  title,
  icon: Icon,
  filters,
  columns,
  rows,
  rowKey,
  mobileCard,
  amountOf,
  emptyMessage,
  filtersActive = false,
  onClearFilters,
  testId,
}: ReceiptVaultProps<T>) {
  return (
    <section
      data-testid={testId}
      className="bg-surface-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      <div className="flex flex-col gap-3 p-4 border-b border-gray-50 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gray-50 rounded-lg p-2" aria-hidden="true">
            <Icon className="w-5 h-5 text-brand-navy" />
          </div>
          <h2 className="font-display font-semibold text-lg text-brand-navy">{title}</h2>
        </div>
        {filters && (
          <div className="flex flex-wrap items-center gap-2">{filters}</div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={Icon}
          title={emptyMessage}
          description={
            filtersActive ? 'Try a different filter, or clear them to see everything.' : undefined
          }
          action={
            filtersActive && onClearFilters
              ? { label: 'Clear filters', onClick: onClearFilters }
              : undefined
          }
          className="m-4"
          data-testid={testId ? `${testId}-empty` : undefined}
        />
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/70 border-b border-gray-100">
                <tr>
                  {columns.map((column) =>
                    column.header ? (
                      <th
                        key={column.key}
                        className={`px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider ${
                          column.align === 'right' ? 'text-right' : 'text-left'
                        } ${column.headerClassName ?? ''}`}
                      >
                        {column.header}
                      </th>
                    ) : (
                      <th
                        key={column.key}
                        className={`px-4 py-3 ${column.headerClassName ?? ''}`}
                      />
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={rowKey(row)} className="hover:bg-gray-50/70 transition-colors">
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-4 py-3 ${
                          column.align === 'right' ? 'text-right' : ''
                        } ${column.cellClassName ?? ''}`}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards. */}
          <ul className="divide-y divide-gray-100 md:hidden">
            {rows.map((row) => (
              <li key={rowKey(row)} className="p-4">
                {mobileCard(row)}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Summary footer */}
      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/70 p-4 text-sm">
          <span className="text-text-muted">
            Showing {rows.length} {rows.length === 1 ? 'receipt' : 'receipts'}
          </span>
          <span className="font-semibold text-brand-navy tabular-nums">
            Total: {formatCurrency(rows.reduce((sum, row) => sum + amountOf(row), 0))}
          </span>
        </div>
      )}
    </section>
  );
}
