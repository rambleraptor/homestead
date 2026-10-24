/**
 * The one way a recipe's tags are shown.
 *
 * `inline` is for places you scan many recipes at once (the list cards, the
 * bulk-import preview): muted dot-separated text that reads as metadata
 * alongside cook time, capped with a "+N" so a recipe that arrived with a
 * dozen tags doesn't outweigh its own title. `chips` is for the recipe page,
 * where every tag is worth showing.
 */

import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

interface RecipeTagsProps {
  tags: string[] | undefined;
  variant?: 'inline' | 'chips';
  /** Show at most this many, then "+N". Unlimited when omitted. */
  max?: number;
  className?: string;
}

export function RecipeTags({ tags, variant = 'chips', max, className }: RecipeTagsProps) {
  if (!tags || tags.length === 0) return null;

  const shown = max === undefined ? tags : tags.slice(0, max);
  const hidden = tags.length - shown.length;

  if (variant === 'inline') {
    return (
      <span
        data-testid="recipe-tags"
        title={hidden > 0 ? tags.join(', ') : undefined}
        className={cn('flex min-w-0 gap-1.5 text-sm text-text-muted', className)}
      >
        <span className="truncate">{shown.join(' · ')}</span>
        {/* Outside the truncating span so a long tag can't clip the count. */}
        {hidden > 0 && <span className="shrink-0">+{hidden}</span>}
      </span>
    );
  }

  return (
    <span data-testid="recipe-tags" className={cn('inline-flex flex-wrap gap-1.5', className)}>
      {shown.map((tag) => (
        <Badge key={tag} variant="neutral">
          {tag}
        </Badge>
      ))}
      {hidden > 0 && <Badge variant="neutral">+{hidden}</Badge>}
    </span>
  );
}
