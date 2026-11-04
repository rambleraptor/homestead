/**
 * The row of collection cards on the recipes home, between the header and the
 * filter bar. Each card is a cover mosaic, the name and a count; the automatic
 * "From social" collection wears an Auto badge. The row scrolls sideways
 * (arrows on wide screens, a swipe on a phone) and ends in a "New collection"
 * card.
 */

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useCookbooks } from '../../hooks/useCookbooks';
import { isAutoCookbook } from '../../utils/cookbooks';
import type { Recipe } from '../../types';
import { CookbookCover } from './CookbookCover';
import { CookbookFormDialog } from './CookbookFormDialog';
import { cookbookPath } from './CookbookStrip';

interface CookbooksRailProps {
  recipes: Recipe[] | undefined;
}

export function CookbooksRail({ recipes }: CookbooksRailProps) {
  const { data: cookbooks, isError, error, refetch } = useCookbooks();
  const [creating, setCreating] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dx: number) => railRef.current?.scrollBy({ left: dx, behavior: 'smooth' });

  return (
    <section aria-labelledby="cookbooks-heading" className="space-y-3" data-testid="cookbooks-rail">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 id="cookbooks-heading" className="text-lg font-display font-semibold text-brand-navy">
            Collections
          </h2>
          {cookbooks && cookbooks.length > 0 && (
            <span className="text-sm text-text-muted" data-testid="cookbooks-count">
              {cookbooks.length}
            </span>
          )}
        </div>
        <div className="hidden items-center gap-1.5 md:flex">
          <button
            type="button"
            onClick={() => scrollBy(-440)}
            aria-label="Scroll collections left"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-surface-white text-brand-navy hover:bg-bg-pearl"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(440)}
            aria-label="Scroll collections right"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-surface-white text-brand-navy hover:bg-bg-pearl"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isError && (
        <QueryError
          compact
          error={error}
          onRetry={() => void refetch()}
          title="Failed to load collections"
          data-testid="cookbooks-error"
        />
      )}

      <div
        ref={railRef}
        className="flex snap-x gap-3.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {(cookbooks ?? []).map((cookbook) => {
          const count = cookbook.recipes?.length ?? 0;
          return (
            <Link
              key={cookbook.id}
              to={cookbookPath(cookbook.id)}
              data-testid={`cookbook-card-${cookbook.name}`}
              className="flex w-44 shrink-0 snap-start flex-col gap-2.5 rounded-xl border border-gray-200 bg-surface-white p-2.5 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
            >
              <div className="relative">
                <CookbookCover cookbook={cookbook} recipes={recipes} className="h-28 w-full" />
                {isAutoCookbook(cookbook) && (
                  <span
                    data-testid="cookbook-auto-badge"
                    className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-brand-navy px-2 py-0.5 text-[11px] font-semibold text-white"
                  >
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    Auto
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-brand-navy">{cookbook.name}</div>
                <div className="text-xs text-text-muted">
                  {count} {count === 1 ? 'recipe' : 'recipes'}
                </div>
              </div>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setCreating(true)}
          data-testid="cookbook-new-button"
          className="flex min-h-[11.5rem] w-44 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-gray-300 text-sm font-medium text-text-muted hover:border-accent-terracotta hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          New collection
        </button>
      </div>

      <CookbookFormDialog isOpen={creating} onClose={() => setCreating(false)} />
    </section>
  );
}
