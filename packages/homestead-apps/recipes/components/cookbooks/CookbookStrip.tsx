/**
 * The way through the collections: a strip of every collection as a chip, with
 * the open one highlighted, and previous/next arrows at the ends. Left and right
 * arrow keys do the same from anywhere on the page that isn't a text field.
 */

import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { isAutoCookbook, neighbours } from '../../utils/cookbooks';
import type { Cookbook } from '../../types';

interface CookbookStripProps {
  cookbooks: Cookbook[];
  currentId: string;
}

export function cookbookPath(id: string): string {
  return `/recipes/collections/${id}`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function CookbookStrip({ cookbooks, currentId }: CookbookStripProps) {
  const navigate = useNavigate();
  const { prev, next } = neighbours(cookbooks, currentId);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === 'ArrowLeft' && prev) navigate(cookbookPath(prev.id));
      else if (event.key === 'ArrowRight' && next) navigate(cookbookPath(next.id));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, prev, next]);

  const arrowClass =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-surface-white text-brand-navy hover:bg-bg-pearl aria-disabled:pointer-events-none aria-disabled:opacity-40';

  return (
    <nav aria-label="Collections" className="flex items-center gap-2" data-testid="cookbook-strip">
      <Link
        to={prev ? cookbookPath(prev.id) : '#'}
        aria-disabled={!prev}
        aria-label={prev ? `Previous collection: ${prev.name}` : 'No previous collection'}
        title={prev ? `${prev.name} (←)` : undefined}
        data-testid="cookbook-prev"
        className={arrowClass}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>

      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cookbooks.map((cookbook) => {
          const active = cookbook.id === currentId;
          return (
            <Link
              key={cookbook.id}
              to={cookbookPath(cookbook.id)}
              aria-current={active ? 'page' : undefined}
              data-testid={`cookbook-chip-${cookbook.name}`}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                active
                  ? 'border-accent-terracotta bg-accent-terracotta text-white'
                  : 'border-gray-200 bg-surface-white text-brand-slate hover:bg-bg-pearl',
              )}
            >
              {isAutoCookbook(cookbook) && <Sparkles className="h-3 w-3" aria-hidden="true" />}
              <span className="max-w-[12rem] truncate">{cookbook.name}</span>
              <span className={active ? 'opacity-85' : 'text-text-muted'}>
                {cookbook.recipes?.length ?? 0}
              </span>
            </Link>
          );
        })}
      </div>

      <Link
        to={next ? cookbookPath(next.id) : '#'}
        aria-disabled={!next}
        aria-label={next ? `Next collection: ${next.name}` : 'No next collection'}
        title={next ? `${next.name} (→)` : undefined}
        data-testid="cookbook-next"
        className={arrowClass}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </nav>
  );
}
