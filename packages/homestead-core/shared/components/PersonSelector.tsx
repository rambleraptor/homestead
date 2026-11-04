/**
 * Shared roster picker used by features that select people from the
 * People app (minigolf, pictionary, …). Renders a search input that
 * filters the visible list client-side, plus a tap-to-toggle grid or
 * chip set. The component is stateless about which IDs are selected —
 * callers provide an `isSelected` predicate and an `onToggle` callback,
 * so consumers can keep their existing storage shape (`people/<id>`
 * paths, raw IDs, etc.).
 */

import { useMemo, useState } from 'react';
import { Loader2, Search, Star } from 'lucide-react';

export interface PersonOption {
  id: string;
  name: string;
}

export type PersonSelectorVariant = 'grid' | 'chips';

export interface PersonSelectorProps {
  people: PersonOption[];
  isSelected: (personId: string) => boolean;
  onToggle: (personId: string) => void;
  loading?: boolean;
  variant?: PersonSelectorVariant;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** data-testid for the wrapper holding the toggle buttons. */
  containerTestId?: string;
  /** Per-row data-testid generator (e.g. `id => \`player-toggle-${id}\``). */
  itemTestId?: (personId: string) => string;
  /** Bare ids the current user has starred: these sort to the front and show a
   *  star. Purely presentational — curate stars from a picker or the People
   *  app. Omit to keep the caller's order with no stars. */
  favoriteIds?: Set<string>;
}

const DEFAULT_EMPTY =
  'Add people in the People app first, then come back.';

const GRID_BUTTON =
  'h-14 px-4 rounded-lg text-base font-medium border-2 transition-colors';
const CHIP_BUTTON =
  'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors';

export function PersonSelector({
  people,
  isSelected,
  onToggle,
  loading,
  variant = 'grid',
  emptyMessage = DEFAULT_EMPTY,
  searchPlaceholder = 'Search people…',
  containerTestId,
  itemTestId,
  favoriteIds,
}: PersonSelectorProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? people.filter((p) => p.name.toLowerCase().includes(q))
      : people;
    if (!favoriteIds?.size) return matched;
    // Stable partition: starred people first, each group keeps caller order.
    const starred = matched.filter((p) => favoriteIds.has(p.id));
    const rest = matched.filter((p) => !favoriteIds.has(p.id));
    return [...starred, ...rest];
  }, [people, query, favoriteIds]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (people.length === 0) {
    return <p className="text-sm text-text-muted">{emptyMessage}</p>;
  }

  const searchTestId = containerTestId
    ? `${containerTestId}-search`
    : 'person-selector-search';
  const wrapperClass =
    variant === 'grid'
      ? 'grid grid-cols-2 gap-2'
      : 'flex flex-wrap gap-2';
  const buttonBase = variant === 'grid' ? GRID_BUTTON : CHIP_BUTTON;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label="Filter people"
          data-testid={searchTestId}
          className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
        />
      </div>

      {filtered.length === 0 ? (
        <p
          className="text-sm text-text-muted italic"
          data-testid={
            containerTestId
              ? `${containerTestId}-empty`
              : 'person-selector-empty'
          }
        >
          No people match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className={wrapperClass} data-testid={containerTestId}>
          {filtered.map((person) => {
            const active = isSelected(person.id);
            const starred = favoriteIds?.has(person.id) ?? false;
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => onToggle(person.id)}
                data-testid={itemTestId ? itemTestId(person.id) : undefined}
                aria-pressed={active}
                className={`${buttonBase} inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-accent-terracotta border-accent-terracotta text-white'
                    : 'bg-surface-white border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {starred && (
                  <Star
                    className={`h-3.5 w-3.5 shrink-0 ${
                      active ? 'fill-white text-white' : 'fill-amber-400 text-amber-400'
                    }`}
                    aria-hidden="true"
                  />
                )}
                {person.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
