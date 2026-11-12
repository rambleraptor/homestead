import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bookmark as BookmarkIcon, Search, X } from 'lucide-react';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { newRecordId } from '@rambleraptor/homestead-core/api/registerResourceMutationDefaults';
import { usePendingSyncIds } from '@rambleraptor/homestead-core/api/usePendingSync';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { useFillPage } from '@rambleraptor/homestead-core/layout/pageFill';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { SyncStatus } from '@rambleraptor/homestead-core/shared/components/PendingSyncBadge';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { Skeleton } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { Input } from '@rambleraptor/homestead-core/shared/components/ui/input';
import { useMediaQuery } from '@rambleraptor/homestead-core/shared/hooks/useMediaQuery';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { sharedTextBody, useShare } from '@rambleraptor/homestead-core/shared/pwa/shareTarget';
import {
  SAVE_PARAM,
  groupByDay,
  isMine,
  linkFrom,
  matchesQuery,
  matchesScope,
  matchesShelf,
  savedAt,
  tagCounts,
  visibilityOf,
  type BookmarkScope,
  type BookmarkShelf,
} from '../bookmarks';
import {
  useCreateBookmark,
  useDeleteBookmark,
  useUpdateBookmark,
} from '../hooks/useBookmarkMutations';
import { useBookmark, useBookmarks } from '../hooks/useBookmarks';
import { rememberedVisibility } from '../hooks/useSaveVisibility';
import { BOOKMARKS, VISIBILITY_HOUSEHOLD, VISIBILITY_PRIVATE } from '../resources';
import type { Bookmark, BookmarkFormData, BookmarkVisibility } from '../types';
import { BookmarkReader } from './BookmarkReader';
import { BookmarkRow } from './BookmarkRow';
import { SaveBox } from './SaveBox';

const BOOKMARK_COLLECTIONS = [BOOKMARKS] as const;
/** How many tags the filter row offers before it would start to wrap for good. */
const TAGS_SHOWN = 12;

const SHELVES: { id: BookmarkShelf; label: string }[] = [
  { id: 'inbox', label: 'To read' },
  { id: 'read', label: 'Read' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'everything', label: 'All' },
];

const SCOPES: { id: BookmarkScope; label: string }[] = [
  { id: 'all', label: 'Everyone’s' },
  { id: 'private', label: 'Private' },
  { id: 'family', label: 'Family' },
];

/** What a bookmark carries over when it is saved again (an undo, a move). */
function carried(bookmark: Bookmark): BookmarkFormData {
  return {
    url: bookmark.url,
    ...(bookmark.title ? { title: bookmark.title } : {}),
    ...(bookmark.tags?.length ? { tags: bookmark.tags } : {}),
    ...(bookmark.read ? { read: true } : {}),
    ...(bookmark.favorite ? { favorite: true } : {}),
    // Back where it was in the list, not at the top.
    saved_at: savedAt(bookmark),
  };
}

/**
 * The reading list: a box to save a link, the saved links by day, and — when
 * one is open — the reader. One mounted page for `/bookmarks` and
 * `/bookmarks/:id`, so the list keeps its filters and place while reading:
 * side by side on a wide screen, one at a time on a phone.
 */
export function BookmarksHome({ params }: AppRouteProps) {
  useFillPage();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const wide = useMediaQuery('(min-width: 1024px)');
  const finePointer = useMediaQuery('(pointer: fine)');
  const selectedId = params?.id || null;
  const userId = aepbase.getCurrentUser()?.id ?? '';

  const bookmarksQuery = useBookmarks();
  const pendingIds = usePendingSyncIds();
  const createBookmark = useCreateBookmark();
  const updateBookmark = useUpdateBookmark();
  const deleteBookmark = useDeleteBookmark();

  const [query, setQuery] = useState('');
  const [shelf, setShelf] = useState<BookmarkShelf>('inbox');
  const [scope, setScope] = useState<BookmarkScope>('all');

  const bookmarks = useMemo(() => bookmarksQuery.data ?? [], [bookmarksQuery.data]);
  const inList = selectedId ? bookmarks.find((bookmark) => bookmark.id === selectedId) : undefined;
  // An address opened directly, before (or without) the list holding it.
  const direct = useBookmark(selectedId && !inList ? selectedId : null);
  const selected = inList ?? direct.data;

  const visible = useMemo(
    () =>
      bookmarks.filter(
        (bookmark) =>
          // The one being read stays in the list even once reading marks it read.
          bookmark.id === selectedId ||
          (matchesShelf(bookmark, shelf) && matchesScope(bookmark, scope) && matchesQuery(bookmark, query)),
      ),
    [bookmarks, selectedId, shelf, scope, query],
  );
  const groups = useMemo(() => groupByDay(visible), [visible]);
  const tags = useMemo(() => tagCounts(bookmarks).slice(0, TAGS_SHOWN), [bookmarks]);
  const filtered = query.trim() !== '' || shelf !== 'everything' || scope !== 'all';

  const { mutateAsync: create, mutate: createNow } = createBookmark;
  const { mutate: update } = updateBookmark;
  const { mutate: remove } = deleteBookmark;

  const save = useCallback(
    (url: string, visibility: BookmarkVisibility) => {
      // A new link is unread and shows under the current filters' day list.
      setQuery('');
      setShelf((current) => (current === 'inbox' || current === 'everything' ? current : 'inbox'));
      return create({ url, visibility });
    },
    [create],
  );

  // A link shared from another app is saved straight away, for whoever the
  // last one was saved for: there's nothing to type, so nothing to ask.
  useShare({
    onText: (shared) => {
      const url = linkFrom(sharedTextBody(shared));
      if (!url) {
        toast.error('There was no link in what was shared.');
        return;
      }
      const visibility = rememberedVisibility();
      void save(url, visibility)
        .then(() => toast.success(visibility === VISIBILITY_HOUSEHOLD ? 'Saved for the family' : 'Saved'))
        // The global mutation handler has already said why.
        .catch(() => {});
    },
  });

  const patch = useCallback(
    (id: string, data: Partial<BookmarkFormData>) => update({ id, data }),
    [update],
  );
  const selectedKey = selected?.id ?? null;
  const patchSelected = useCallback(
    (data: Partial<BookmarkFormData>) => {
      if (selectedKey) patch(selectedKey, data);
    },
    [patch, selectedKey],
  );

  const removeSelected = () => {
    if (!selected) return;
    const gone = selected;
    remove(gone.id);
    navigate('/bookmarks');
    toast.undo('Bookmark deleted', () =>
      createNow({ ...carried(gone), visibility: visibilityOf(gone), recordId: gone.id }),
    );
  };

  // Visibility is fixed per record, so changing it saves the link again as
  // the other kind and removes this one. The page is fetched afresh.
  const moveSelected = () => {
    if (!selected) return;
    const to = visibilityOf(selected) === VISIBILITY_PRIVATE ? VISIBILITY_HOUSEHOLD : VISIBILITY_PRIVATE;
    const recordId = newRecordId();
    createNow({ ...carried(selected), visibility: to, recordId });
    remove(selected.id);
    navigate(`/bookmarks/${recordId}`, { replace: true });
    toast.success(to === VISIBILITY_HOUSEHOLD ? 'Shared with the family' : 'Made private');
  };

  const showList = wide || !selectedId;
  const focusSave = !selectedId && (searchParams.has(SAVE_PARAM) || finePointer);

  return (
    <div className="flex min-h-0 flex-1" data-testid="bookmarks-home">
      {showList && (
        <section
          aria-label="Saved links"
          className={cn(
            'flex min-h-0 flex-col',
            selectedId ? 'w-[26rem] shrink-0 border-r border-gray-200' : 'w-full',
          )}
        >
          <div className={cn('space-y-3 border-b border-gray-200 px-4 py-3', !selectedId && 'lg:px-6')}>
            <div
              className={cn(
                'mx-auto flex gap-x-3 gap-y-2',
                // Beside the reader the list is narrow: the search gets its own line.
                // …as it does on a phone.
                selectedId ? 'flex-col' : 'max-w-3xl flex-col sm:flex-row sm:items-center',
              )}
            >
              <div className="min-w-0">
                <h1 className="font-display text-xl font-bold tracking-tight text-brand-navy">Bookmarks</h1>
                <SyncStatus collections={BOOKMARK_COLLECTIONS} />
              </div>
              <div className={cn('relative w-full', !selectedId && 'sm:ml-auto sm:max-w-xs')}>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setQuery('');
                  }}
                  placeholder="Search or #tag"
                  aria-label="Search bookmarks"
                  className="pl-9 pr-9"
                  data-testid="bookmarks-search"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-main"
                    data-testid="bookmarks-search-clear"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>

            <SaveBox
              onSave={save}
              autoFocus={focusSave}
              compact={!!selectedId}
              className={cn('mx-auto', !selectedId && 'max-w-3xl')}
            />

            <div className={cn('mx-auto flex flex-wrap items-center gap-x-4 gap-y-2', !selectedId && 'max-w-3xl')}>
              <FilterTabs label="Show" options={SHELVES} value={shelf} onChange={setShelf} testId="bookmarks-shelf" />
              <FilterTabs label="Whose" options={SCOPES} value={scope} onChange={setScope} testId="bookmarks-scope" />
            </div>

            {tags.length > 0 && (
              <div
                className={cn('mx-auto flex flex-wrap gap-1', !selectedId && 'max-w-3xl')}
                data-testid="bookmarks-tags"
              >
                {tags.map(({ tag, count }) => {
                  const active = query.trim().toLowerCase() === `#${tag}`;
                  return (
                    <button
                      key={tag}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setQuery(active ? '' : `#${tag}`)}
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs',
                        active ? 'bg-brand-navy text-white' : 'bg-gray-100 text-brand-slate hover:bg-gray-200',
                      )}
                      data-testid={`bookmarks-tag-${tag}`}
                    >
                      #{tag} <span className="opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className={cn('min-h-0 flex-1 overflow-y-auto px-2 py-2', !selectedId && 'lg:px-4')} data-testid="bookmarks-list">
            <div className={cn('mx-auto', !selectedId && 'max-w-3xl')}>
              {bookmarksQuery.isLoading ? (
                <div className="space-y-3 p-2" aria-busy="true">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-5 w-3/4" />
                </div>
              ) : bookmarksQuery.isError ? (
                <QueryError
                  error={bookmarksQuery.error}
                  onRetry={() => void bookmarksQuery.refetch()}
                  title="Couldn't load your bookmarks"
                />
              ) : bookmarks.length === 0 ? (
                <EmptyState
                  icon={BookmarkIcon}
                  title="Nothing saved yet"
                  description="Paste a link above to keep it. Homestead fetches the page so you can read it here later, and find it again by searching."
                />
              ) : visible.length === 0 ? (
                <p className="px-2 py-8 text-center text-text-muted" data-testid="bookmarks-no-matches">
                  {query.trim()
                    ? `No bookmarks match “${query.trim()}”.`
                    : shelf === 'inbox'
                      ? 'You’re all caught up — nothing left to read.'
                      : 'No bookmarks here.'}
                </p>
              ) : (
                <>
                  {filtered && query.trim() && (
                    <p className="px-2 pb-1 text-sm text-text-muted" data-testid="bookmarks-match-count">
                      {visible.length === 1 ? '1 bookmark matches' : `${visible.length} bookmarks match`}
                    </p>
                  )}
                  {groups.map((group) => (
                    <section key={group.key} aria-label={group.label} data-testid={`bookmarks-day-${group.key}`}>
                      <h2 className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                        {group.label}
                      </h2>
                      <ul>
                        {group.bookmarks.map((bookmark) => (
                          <BookmarkRow
                            key={bookmark.id}
                            bookmark={bookmark}
                            selected={bookmark.id === selectedId}
                            pending={pendingIds.has(bookmark.id)}
                            onTag={(tag) => setQuery(`#${tag}`)}
                            onToggleFavorite={(b) => patch(b.id, { favorite: !b.favorite })}
                            onToggleRead={(b) => patch(b.id, { read: !b.read })}
                          />
                        ))}
                      </ul>
                    </section>
                  ))}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {selectedId && (
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" data-testid="bookmark-pane">
          {selected ? (
            <BookmarkReader
              key={selected.id}
              bookmark={selected}
              mine={isMine(selected, userId)}
              onBack={() => navigate('/bookmarks')}
              onUpdate={patchSelected}
              onDelete={removeSelected}
              onMove={moveSelected}
            />
          ) : bookmarksQuery.isLoading || direct.isLoading ? (
            <div className="mx-auto max-w-3xl space-y-3 p-6" aria-busy="true">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={BookmarkIcon}
                title="This bookmark isn’t here"
                description="It may have been deleted, or it’s private to someone else."
                action={{ label: 'Back to bookmarks', onClick: () => navigate('/bookmarks'), testId: 'bookmark-missing-back' }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FilterTabsProps<T extends string> {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testId: string;
}

function FilterTabs<T extends string>({ label, options, value, onChange, testId }: FilterTabsProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1" data-testid={testId}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'rounded-full px-3 py-1 text-sm',
              active ? 'bg-brand-navy text-white' : 'text-text-muted hover:bg-gray-100 hover:text-text-main',
            )}
            data-testid={`${testId}-${option.id}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
