import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Cake, Heart, Plus, Upload } from 'lucide-react';
import { Card } from '../../../shared/components/Card';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { Spinner } from '../../../shared/components/Spinner';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { useToast } from '../../../shared/components/ToastProvider';
import { useEvents } from '../hooks/useEvents';
import { useCreateEvent } from '../hooks/useCreateEvent';
import { useUpdateEvent } from '../hooks/useUpdateEvent';
import { useDeleteEvent } from '../hooks/useDeleteEvent';
import { useEventStats } from '../hooks/useEventStats';
import { EventForm } from './EventForm';
import { EventCard } from './EventCard';
import type { Event, EventFormData } from '../types';

export function EventsHome() {
  const navigate = useNavigate();
  const { data: events, isLoading } = useEvents();
  const { data: stats } = useEventStats();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const toast = useToast();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    eventId: string | null;
    eventTitle: string | null;
  }>({ isOpen: false, eventId: null, eventTitle: null });

  const handleCreateEvent = async (data: EventFormData) => {
    try {
      await createEvent.mutateAsync(data);
      setIsCreateModalOpen(false);
      toast.success('Event created successfully!');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to create event. Please try again.'
      );
    }
  };

  const handleUpdateEvent = async (data: EventFormData) => {
    if (!editingEvent) return;

    try {
      await updateEvent.mutateAsync({ id: editingEvent.id, data });
      setEditingEvent(null);
      toast.success('Event updated successfully!');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update event. Please try again.'
      );
    }
  };

  const handleDeleteClick = (event: Event) => {
    setDeleteConfirmation({
      isOpen: true,
      eventId: event.id,
      eventTitle: event.title,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.eventId) return;

    try {
      await deleteEvent.mutateAsync(deleteConfirmation.eventId);
      setDeleteConfirmation({ isOpen: false, eventId: null, eventTitle: null });
      toast.success('Event deleted successfully!');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete event. Please try again.'
      );
    }
  };

  const getUpcomingEvents = () => {
    if (!events) return [];

    const now = new Date();
    const oneMonthFromNow = new Date(now);
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

    return events
      .filter((event) => {
        const eventDate = new Date(event.event_date);

        if (event.recurring_yearly) {
          let nextOccurrence = new Date(
            now.getFullYear(),
            eventDate.getMonth(),
            eventDate.getDate()
          );

          // If the event has already passed this year, use next year's date
          if (nextOccurrence < now) {
            nextOccurrence = new Date(
              now.getFullYear() + 1,
              eventDate.getMonth(),
              eventDate.getDate()
            );
          }

          return nextOccurrence >= now && nextOccurrence <= oneMonthFromNow;
        }

        return eventDate >= now && eventDate <= oneMonthFromNow;
      })
      .sort((a, b) => {
        const dateA = new Date(a.event_date);
        const dateB = new Date(b.event_date);
        return dateA.getTime() - dateB.getTime();
      });
  };

  const upcomingEvents = getUpcomingEvents();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Events
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Track important birthdays and anniversaries
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/events/import')}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Event
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="flex items-center">
              <Calendar className="w-8 h-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Total Events
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.totalEvents}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center">
              <Cake className="w-8 h-8 text-pink-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Upcoming Birthdays
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.upcomingBirthdays}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center">
              <Heart className="w-8 h-8 text-red-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Upcoming Anniversaries
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.upcomingAnniversaries}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Upcoming Events (Next 30 Days)
        </h2>
        {upcomingEvents.length === 0 ? (
          <Card>
            <p className="text-center text-gray-600 dark:text-gray-400 py-8">
              No upcoming events in the next 30 days
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onEdit={setEditingEvent}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          All Events
        </h2>
        {!events || events.length === 0 ? (
          <Card>
            <p className="text-center text-gray-600 dark:text-gray-400 py-8">
              No events yet. Add your first event to get started!
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onEdit={setEditingEvent}
                onDelete={handleDeleteClick}
                showDetails={false}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Event"
      >
        <EventForm
          onSubmit={handleCreateEvent}
          onCancel={() => setIsCreateModalOpen(false)}
          isSubmitting={createEvent.isPending}
        />
      </Modal>

      <Modal
        isOpen={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        title="Edit Event"
      >
        {editingEvent && (
          <EventForm
            initialData={editingEvent}
            onSubmit={handleUpdateEvent}
            onCancel={() => setEditingEvent(null)}
            isSubmitting={updateEvent.isPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={() =>
          setDeleteConfirmation({ isOpen: false, eventId: null, eventTitle: null })
        }
        onConfirm={handleDeleteConfirm}
        title="Delete Event"
        message={`Are you sure you want to delete "${deleteConfirmation.eventTitle}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteEvent.isPending}
      />
    </div>
  );
}
