/**
 * Which cookbooks a recipe is in, as small chips linking to each. Rendered on
 * the list cards (capped, inline) and on the recipe page (all of them).
 */

import { Link } from 'react-router-dom';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useCookbooks } from '../../hooks/useCookbooks';
import { cookbooksContaining } from '../../utils/cookbooks';
import { cookbookPath } from './CookbookStrip';

interface CookbookChipsProps {
  recipeId: string;
  /** Show at most this many, then "+N". Unlimited when omitted. */
  max?: number;
  /** Text before the chips, e.g. "In". */
  label?: string;
  className?: string;
}

export function CookbookChips({ recipeId, max, label, className }: CookbookChipsProps) {
  const { data: cookbooks } = useCookbooks();
  const mine = cookbooksContaining(cookbooks, recipeId);
  if (mine.length === 0) return null;

  const shown = max === undefined ? mine : mine.slice(0, max);
  const hidden = mine.length - shown.length;

  return (
    <span
      data-testid="recipe-cookbooks"
      className={cn('inline-flex flex-wrap items-center gap-1.5 text-xs', className)}
    >
      {label && <span className="text-text-muted">{label}</span>}
      {shown.map((cookbook) => (
        <Link
          key={cookbook.id}
          to={cookbookPath(cookbook.id)}
          data-testid={`recipe-cookbook-chip-${cookbook.name}`}
          className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 font-medium text-brand-navy hover:border-accent-terracotta"
        >
          {cookbook.name}
        </Link>
      ))}
      {hidden > 0 && <span className="text-text-muted">+{hidden}</span>}
    </span>
  );
}
