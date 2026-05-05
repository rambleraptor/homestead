'use client';

import { useState } from 'react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import {
  getNextOccurrence,
  parseDateString,
} from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { useEvents } from '../hooks/useEvents';
import { useUpdateEvent } from '../hooks/useUpdateEvent';
import { useDeleteEvent } from '../hooks/useDeleteEvent';
import { EventForm } from './EventForm';
import { EventCard } from './EventCard';
import type { Event, EventFormData } from '../types';

function eventNextOccurrenceMs(e: Event): number {
  if (!e.date?.trim()) return Number.POSITIVE_INFINITY;
  return getNextOccurrence(parseDateString(e.date)).getTime();
}

export function EventsList() {
  const { data: events, isLoading } = useEvents();
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(
    null,
  );
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const toast = useToast();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const sorted = [...(events ?? [])].sort(
    (a, b) => eventNextOccurrenceMs(a) - eventNextOccurrenceMs(b),
  );

  const handleUpdate = async (data: EventFormData) => {
    if (!editingEvent) return;
    try {
      await updateEvent.mutateAsync({ id: editingEvent.id, data });
      setEditingEvent(null);
      toast.success('Event updated');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update event',
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirm) return;
    try {
      await deleteEvent.mutateAsync(confirm.id);
      setConfirm(null);
      toast.success('Event deleted');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete event',
      );
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">All Events</h2>
      {sorted.length === 0 ? (
        <Card>
          <p className="text-center text-gray-600 py-8">
            No events yet. Add your first event to get started!
          </p>
        </Card>
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
