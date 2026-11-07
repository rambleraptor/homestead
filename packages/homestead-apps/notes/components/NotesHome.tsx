import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { NotebookPen, Search, X } from 'lucide-react';
import { useFillPage } from '@rambleraptor/homestead-core/layout/pageFill';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { Skeleton } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { Input } from '@rambleraptor/homestead-core/shared/components/ui/input';
import { useCreateNote } from '../hooks/useCreateNote';
import { useDeleteNote } from '../hooks/useDeleteNote';
import { useNotes } from '../hooks/useNotes';
import { useUpdateNote } from '../hooks/useUpdateNote';
import { groupByDay, matchesQuery } from '../notes';
import type { Note } from '../types';
import { NoteComposer } from './NoteComposer';
import { NoteRow } from './NoteRow';

/** How many notes render at first, and how many more each step back in time adds. */
const PAGE_SIZE = 100;

/**
 * The notebook: every note in one stream, oldest at the top and the newest
 * just above the composer docked at the bottom — scroll up to go back in
 * time. Search filters the same stream; tapping a #tag searches for it.
 */
export function NotesHome() {
  useFillPage();
  const toast = useToast();
  const notesQuery = useNotes();
  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();

  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  // Distance from the bottom to restore after showing earlier notes, so the
  // page doesn't jump; or 0 to land at the bottom (on load, a new note, a search).
  const anchorFromBottom = useRef(0);

  const matching = useMemo(
    () => (notesQuery.data ?? []).filter((note) => matchesQuery(note, query)),
    [notesQuery.data, query],
  );
  // `matching` is newest first; the stream shows the newest `visibleCount`.
  const hiddenCount = Math.max(0, matching.length - visibleCount);
  const hasEarlier = hiddenCount > 0;
  const groups = useMemo(() => groupByDay(matching.slice(0, visibleCount)), [matching, visibleCount]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight - el.clientHeight - anchorFromBottom.current;
    anchorFromBottom.current = 0;
  }, [groups]);

  const showEarlier = () => {
    const el = scrollRef.current;
    if (el) anchorFromBottom.current = el.scrollHeight - el.clientHeight - el.scrollTop;
    setVisibleCount((n) => n + PAGE_SIZE);
  };

  // Reaching the top of the stream shows the notes before it.
  const showEarlierRef = useRef(showEarlier);
  showEarlierRef.current = showEarlier;
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) showEarlierRef.current();
      },
      { root: scrollRef.current, rootMargin: '200px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasEarlier]);

  const search = (value: string) => {
    setQuery(value);
    setVisibleCount(PAGE_SIZE);
  };

  const save = (body: string) => {
    search('');
    return createNote.mutateAsync({ body });
  };

  const update = (id: string, data: Partial<Pick<Note, 'body' | 'struck'>>) =>
    updateNote.mutateAsync({ id, data });

  const remove = (note: Note) => {
    deleteNote.mutate(note.id);
    toast.undo('Note deleted', () =>
      createNote.mutate({
        body: note.body,
        ...(note.struck ? { struck: true } : {}),
        recordId: note.id,
      }),
    );
  };

  const notes = notesQuery.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="notes-home">
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 lg:px-6">
        <h1 className="font-display text-xl font-bold tracking-tight text-brand-navy">Notes</h1>
        <div className="relative ml-auto w-full max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') search('');
            }}
            placeholder="Search notes or #tags"
            aria-label="Search notes"
            className="pl-9 pr-9"
            data-testid="notes-search"
          />
          {query && (
            <button
              type="button"
              onClick={() => search('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-main"
              data-testid="notes-search-clear"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto bg-[repeating-linear-gradient(transparent,transparent_31px,rgb(0_0_0/0.03)_32px)] px-4 lg:px-6"
        data-testid="notes-stream"
      >
        <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-end py-4">
          {notesQuery.isLoading ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : notesQuery.isError ? (
            <QueryError
              error={notesQuery.error}
              onRetry={() => void notesQuery.refetch()}
              title="Couldn't load your notes"
            />
          ) : notes.length === 0 ? (
            <EmptyState
              icon={NotebookPen}
              title="Your notebook is empty"
              description="Jot anything down below — a phone number, an idea, a reminder. Add #tags to find things later."
            />
          ) : matching.length === 0 ? (
            <p className="py-8 text-center text-text-muted" data-testid="notes-no-matches">
              No notes match “{query}”.
            </p>
          ) : (
            <>
              {query && (
                <p className="pb-2 text-sm text-text-muted" data-testid="notes-match-count">
                  {matching.length === 1 ? '1 note matches' : `${matching.length} notes match`}
                </p>
              )}
              {hasEarlier && (
                <div ref={topSentinelRef} className="flex justify-center pb-3">
                  <Button variant="ghost" size="sm" onClick={showEarlier} data-testid="notes-show-earlier">
                    Show earlier notes ({hiddenCount})
                  </Button>
                </div>
              )}
              {groups.map((group) => (
                <section key={group.key} aria-label={group.label} data-testid={`notes-day-${group.key}`}>
                  <h2 className="sticky top-0 z-10 -mx-1 bg-surface-white/90 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted backdrop-blur">
                    {group.label}
                  </h2>
                  <ol>
                    {group.notes.map((note) => (
                      <NoteRow
                        key={note.id}
                        note={note}
                        onTag={(tag) => search(`#${tag}`)}
                        onUpdate={update}
                        onDelete={remove}
                      />
                    ))}
                  </ol>
                </section>
              ))}
            </>
          )}
        </div>
      </div>

      <NoteComposer onSave={save} />
    </div>
  );
}
