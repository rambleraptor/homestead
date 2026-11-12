import { Link } from 'react-router-dom';
import {
  Check,
  CircleAlert,
  FileText,
  Globe,
  Loader2,
  Play,
  Smartphone,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { VisibilityBadge } from '@rambleraptor/homestead-core/permissions/components/VisibilityBadge';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { displayTitle, sourceLabel } from '../bookmarks';
import type { Bookmark, BookmarkKind } from '../types';

const KIND_ICONS: Record<BookmarkKind, LucideIcon> = {
  article: FileText,
  video: Play,
  pdf: FileText,
  page: Globe,
};

interface BookmarkRowProps {
  bookmark: Bookmark;
  /** Open in the reader beside the list. */
  selected: boolean;
  /** Saved on this device, not yet sent. */
  pending: boolean;
  onTag: (tag: string) => void;
  onToggleFavorite: (bookmark: Bookmark) => void;
  onToggleRead: (bookmark: Bookmark) => void;
}

/** One saved link: what it is, where it's from, and its two quick switches. */
export function BookmarkRow({
  bookmark,
  selected,
  pending,
  onTag,
  onToggleFavorite,
  onToggleRead,
}: BookmarkRowProps) {
  const Icon = KIND_ICONS[bookmark.kind ?? 'page'];
  const fetching = bookmark.status === 'pending' || !bookmark.status;
  const failed = bookmark.status === 'failed';
  const tags = bookmark.tags ?? [];

  return (
    <li
      className={cn(
        'group flex items-start gap-3 rounded-lg px-2 py-2.5',
        selected ? 'bg-bg-pearl' : 'hover:bg-gray-50',
      )}
      data-testid="bookmark-row"
      data-bookmark-id={bookmark.id}
      data-read={bookmark.read ? 'true' : 'false'}
    >
      <Icon className="mt-1 size-4 shrink-0 text-text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <Link
          to={`/bookmarks/${bookmark.id}`}
          aria-current={selected ? 'page' : undefined}
          className={cn(
            'block truncate font-body text-text-main hover:underline',
            bookmark.read ? 'font-normal text-text-muted' : 'font-semibold',
          )}
          data-testid="bookmark-open"
        >
          {displayTitle(bookmark)}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
          <span className="truncate" data-testid="bookmark-source">
            {sourceLabel(bookmark)}
          </span>
          {bookmark.author && <span className="truncate">· {bookmark.author}</span>}
          <VisibilityBadge singular="bookmark" record={{ ...bookmark }} showShared />
          {bookmark.saved_via === 'drop-box' && (
            // Came through the drop box, so it could have been put there by
            // someone else: marked, to be recognisable.
            <span className="inline-flex items-center gap-1" data-testid="bookmark-via-phone">
              <Smartphone className="size-3" aria-hidden />
              via iPhone
            </span>
          )}
          {fetching && (
            <span className="inline-flex items-center gap-1" data-testid="bookmark-fetching">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              {pending ? 'Waiting to send' : 'Fetching the page…'}
            </span>
          )}
          {failed && (
            <span className="inline-flex items-center gap-1 text-amber-700" data-testid="bookmark-failed">
              <CircleAlert className="size-3" aria-hidden />
              Couldn’t read the page
            </span>
          )}
        </div>
        {bookmark.excerpt && (
          <p className="mt-1 line-clamp-2 text-sm text-text-muted" data-testid="bookmark-excerpt">
            {bookmark.excerpt}
          </p>
        )}
        {tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onTag(tag)}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-brand-slate hover:bg-gray-200"
                data-testid={`bookmark-tag-${tag}`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => onToggleFavorite(bookmark)}
          aria-pressed={!!bookmark.favorite}
          aria-label={bookmark.favorite ? 'Remove from favorites' : 'Add to favorites'}
          className={cn(
            'rounded p-2 hover:bg-gray-100',
            bookmark.favorite ? 'text-amber-500' : 'text-text-muted',
          )}
          data-testid="bookmark-favorite"
        >
          <Star className="size-4" fill={bookmark.favorite ? 'currentColor' : 'none'} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onToggleRead(bookmark)}
          aria-pressed={!!bookmark.read}
          aria-label={bookmark.read ? 'Mark as unread' : 'Mark as read'}
          className={cn('rounded p-2 hover:bg-gray-100', bookmark.read ? 'text-emerald-600' : 'text-text-muted')}
          data-testid="bookmark-read"
        >
          <Check className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
