import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ExternalLink,
  Lock,
  RefreshCw,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { ShareButton } from '@rambleraptor/homestead-core/permissions/components/ShareButton';
import { VisibilityBadge } from '@rambleraptor/homestead-core/permissions/components/VisibilityBadge';
import { MessageResponse } from '@rambleraptor/homestead-core/shared/components/ai-elements/message';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { Skeleton } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { TagInput } from '@rambleraptor/homestead-core/shared/components/TagInput';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { displayTitle, normalizeTag, readingTime, sourceLabel, visibilityOf } from '../bookmarks';
import { useBookmarkPage } from '../hooks/useBookmarkPage';
import type { Bookmark, BookmarkFormData } from '../types';

/**
 * A page's pictures as plain images: no download button (which, inside a
 * linked image, would nest one button in another), loaded only when scrolled
 * to, and without telling the picture's host which page is being read.
 */
const readerComponents = {
  img: ({ src, alt }: { src?: string | Blob; alt?: string }) =>
    typeof src === 'string' && src ? (
      <img
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="my-4 h-auto max-w-full rounded-lg"
      />
    ) : null,
};

interface BookmarkReaderProps {
  bookmark: Bookmark;
  /** The signed-in person saved it: they may move it between private and family. */
  mine: boolean;
  onBack: () => void;
  onUpdate: (data: Partial<BookmarkFormData>) => void;
  onDelete: () => void;
  /** Save it again with the other visibility (it is fixed per record). */
  onMove: () => void;
}

/**
 * One bookmark, opened: the readable copy Homestead kept, with the original a
 * tap away, and everything that can be done to it.
 */
export function BookmarkReader({ bookmark, mine, onBack, onUpdate, onDelete, onMove }: BookmarkReaderProps) {
  const ready = bookmark.status === 'ready';
  const page = useBookmarkPage(bookmark.id, ready);
  const [editingTags, setEditingTags] = useState(false);
  const isPrivate = visibilityOf(bookmark) === 'private';

  // Opening your own unread link reads it. A family link someone else saved
  // stays as they left it: "read" there is everyone's, so it's a deliberate tap.
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mine || bookmark.read || !ready || markedRef.current === bookmark.id) return;
    markedRef.current = bookmark.id;
    onUpdate({ read: true });
  }, [mine, bookmark.id, bookmark.read, ready, onUpdate]);

  const meta = [sourceLabel(bookmark), bookmark.author, readingTime(page.data?.word_count)].filter(Boolean);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-4 lg:px-8" data-testid="bookmark-reader">
      <div className="mb-3 lg:hidden">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="bookmark-back">
          <ArrowLeft className="mr-1 size-4" aria-hidden />
          Bookmarks
        </Button>
      </div>

      <header className="border-b border-gray-200 pb-4">
        <h1
          className="font-display text-2xl font-bold tracking-tight text-brand-navy"
          data-testid="bookmark-reader-title"
        >
          {displayTitle(bookmark)}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
          <span data-testid="bookmark-reader-meta">{meta.join(' · ')}</span>
          <VisibilityBadge singular="bookmark" record={{ ...bookmark }} showShared />
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={bookmark.url} target="_blank" rel="noopener noreferrer" data-testid="bookmark-original">
              <ExternalLink className="mr-1 size-4" aria-hidden />
              Original
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-pressed={!!bookmark.favorite}
            onClick={() => onUpdate({ favorite: !bookmark.favorite })}
            data-testid="bookmark-reader-favorite"
          >
            <Star
              className="mr-1 size-4"
              fill={bookmark.favorite ? 'currentColor' : 'none'}
              aria-hidden
            />
            {bookmark.favorite ? 'Favorited' : 'Favorite'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-pressed={!!bookmark.read}
            onClick={() => onUpdate({ read: !bookmark.read })}
            data-testid="bookmark-reader-read"
          >
            <Check className="mr-1 size-4" aria-hidden />
            {bookmark.read ? 'Mark unread' : 'Mark read'}
          </Button>
          {mine && (
            <Button size="sm" variant="outline" onClick={onMove} data-testid="bookmark-move">
              {isPrivate ? (
                <Users className="mr-1 size-4" aria-hidden />
              ) : (
                <Lock className="mr-1 size-4" aria-hidden />
              )}
              {isPrivate ? 'Share with family' : 'Make private'}
            </Button>
          )}
          {isPrivate && (
            <ShareButton
              resourceType="bookmark"
              recordId={bookmark.id}
              recordName={displayTitle(bookmark)}
              ownerId={bookmark.created_by}
              appId="bookmarks"
              label="Share with…"
            />
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onUpdate({ status: 'pending' })}
            disabled={bookmark.status === 'pending'}
            data-testid="bookmark-refetch"
          >
            <RefreshCw className="mr-1 size-4" aria-hidden />
            Fetch again
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700"
            onClick={onDelete}
            data-testid="bookmark-delete"
          >
            <Trash2 className="mr-1 size-4" aria-hidden />
            Delete
          </Button>
        </div>

        <div className="mt-3">
          {editingTags ? (
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <TagInput
                  value={bookmark.tags ?? []}
                  onChange={(next) =>
                    onUpdate({ tags: [...new Set(next.map(normalizeTag).filter(Boolean))] })
                  }
                  placeholder="Add a tag…"
                  testId="bookmark-tags"
                />
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditingTags(false)} data-testid="bookmark-tags-done">
                Done
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1">
              {(bookmark.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-brand-slate"
                  data-testid={`bookmark-reader-tag-${tag}`}
                >
                  #{tag}
                </span>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setEditingTags(true)} data-testid="bookmark-tags-edit">
                {(bookmark.tags ?? []).length > 0 ? 'Edit tags' : 'Add tags'}
              </Button>
            </div>
          )}
        </div>
      </header>

      <div className="py-6" data-testid="bookmark-reader-body">
        {bookmark.status === 'failed' ? (
          <Notice
            testId="bookmark-reader-failed"
            title="Homestead couldn’t read this page"
            detail={bookmark.fetch_error || 'The link still works — open the original.'}
          />
        ) : !ready ? (
          <div aria-busy="true" data-testid="bookmark-reader-fetching">
            <p className="mb-4 text-sm text-text-muted">Fetching the page…</p>
            <ReaderSkeleton />
          </div>
        ) : page.missing ? (
          <Notice
            testId="bookmark-reader-empty"
            title="There’s nothing to read here"
            detail="This page has no article text to keep — open the original to see it."
          />
        ) : page.isError ? (
          <QueryError
            error={page.error}
            onRetry={() => void page.refetch()}
            title="Couldn’t load the saved copy"
          />
        ) : page.isLoading || !page.data ? (
          <ReaderSkeleton />
        ) : (
          // A finished document, not a reply being typed; and a page's tables
          // are for reading, so they get no copy/download toolbar.
          <MessageResponse
            mode="static"
            controls={{ table: false }}
            components={readerComponents}
            className="text-base leading-relaxed"
            data-testid="bookmark-reader-content"
          >
            {page.data.content ?? ''}
          </MessageResponse>
        )}
      </div>
    </article>
  );
}

function ReaderSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function Notice({ title, detail, testId }: { title: string; detail: string; testId: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center" data-testid={testId}>
      <BookOpen className="mx-auto size-6 text-text-muted" aria-hidden />
      <p className="mt-2 font-medium text-text-main">{title}</p>
      <p className="mt-1 text-sm text-text-muted">{detail}</p>
    </div>
  );
}
