import { useState } from 'react';
import { CalendarHeart, SearchX } from 'lucide-react';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import {
  FilterBar,
  AppFiltersProvider,
  useAppFilterValues,
  useFilteredItems,
} from '@rambleraptor/homestead-core/shared/filters';
import { hasEventDate, nextOccurrence } from '../utils/eventDate';
import { useEvents } from '../hooks/useEvents';
import { useUpdateEvent } from '../hooks/useUpdateEvent';
import { useDeleteEvent } from '../hooks/useDeleteEvent';
import { eventsApp } from '../app.config';
import { EventForm } from './EventForm';
import { EventCard } from './EventCard';
import type { Event, EventFormData } from '../types';

function eventNextOccurrenceMs(e: Event): number {
  if (!hasEventDate(e)) return Number.POSITIVE_INFINITY;
  return nextOccurrence(e).getTime();
}

interface EventsListProps {
  /** Opens the create form; offered by the empty state. */
  onAddEvent?: () => void;
}

export function EventsList({ onAddEvent }: EventsListProps) {
  const { data: events, isLoading, isError, error, refetch } = useEvents();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <QueryError
        error={error}
        onRetry={() => void refetch()}
        title="Failed to load events"
        data-testid="events-error"
      />
    );
  }

  return (
    <AppFiltersProvider
      appId={eventsApp.id}
      decls={eventsApp.web?.filters ?? []}
      items={events ?? []}
    >
      <EventsListInner hasAny={(events?.length ?? 0) > 0} onAddEvent={onAddEvent} />
    </AppFiltersProvider>
  );
}

function EventsListInner({
  hasAny,
  onAddEvent,
}: {
  hasAny: boolean;
  onAddEvent?: () => void;
}) {
  const filteredEvents = useFilteredItems<Event>();
  const { reset: clearFilters } = useAppFilterValues();
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(
    null,
  );
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const toast = useToast();

  const sorted = [...filteredEvents].sort(
    (a, b) => eventNextOccurrenceMs(a) - eventNextOccurrenceMs(b),
  );

  const handleUpdate = async (data: EventFormData) => {
    if (!editingEvent) return;
    try {
      await updateEvent.mutateAsync({ id: editingEvent.id, data });
      setEditingEvent(null);
      toast.success('Event updated');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirm) return;
    try {
      await deleteEvent.mutateAsync(confirm.id);
      setConfirm(null);
      toast.success('Event deleted');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-brand-navy mb-4">All Events</h2>
      <FilterBar />
      {!hasAny ? (
        <EmptyState
          icon={CalendarHeart}
          title="No events yet"
          description="Add the birthdays, anniversaries and other dates that come round every year."
          action={
            onAddEvent
              ? { label: 'Add event', onClick: onAddEvent, testId: 'events-empty-add' }
              : undefined
          }
          assistantPrompt="Add Sam's birthday on March 3"
          data-testid="events-empty"
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No events match the current filters"
          description="Try a different filter, or clear them to see every event."
          action={{ label: 'Clear filters', onClick: clearFilters, testId: 'events-clear-filters' }}
          data-testid="events-no-matches"
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onEdit={setEditingEvent}
              onDelete={(e) => setConfirm({ id: e.id, name: e.name })}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        title="Edit Event"
      >
        {editingEvent && (
          <EventForm
            initialData={editingEvent}
            onSubmit={handleUpdate}
            onCancel={() => setEditingEvent(null)}
            isSubmitting={updateEvent.isPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Event"
        message={
          confirm
            ? `Are you sure you want to delete "${confirm.name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteEvent.isPending}
      />
    </div>
  );
}
