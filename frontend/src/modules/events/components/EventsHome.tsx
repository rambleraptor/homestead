import { useState } from 'react';
import { Calendar, Cake, Heart, Plus, Trash2, Edit } from 'lucide-react';
import { Card } from '../../../shared/components/Card';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { Spinner } from '../../../shared/components/Spinner';
import { useEvents } from '../hooks/useEvents';
import { useCreateEvent } from '../hooks/useCreateEvent';
import { useUpdateEvent } from '../hooks/useUpdateEvent';
import { useDeleteEvent } from '../hooks/useDeleteEvent';
import { useEventStats } from '../hooks/useEventStats';
import { EventForm } from './EventForm';
import type { Event, EventFormData } from '../types';

export function EventsHome() {
  const { data: events, isLoading } = useEvents();
  const { data: stats } = useEventStats();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);

  const handleCreateEvent = async (data: EventFormData) => {
    try {
      await createEvent.mutateAsync(data);
      setIsCreateModalOpen(false);
    } catch (error) {
      console.error('Failed to create event:', error);
    }
  };

  const handleUpdateEvent = async (data: EventFormData) => {
    if (!editingEvent) return;

    try {
      await updateEvent.mutateAsync({ id: editingEvent.id, data });
      setEditingEvent(null);
    } catch (error) {
      console.error('Failed to update event:', error);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      await deleteEvent.mutateAsync(id);
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
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
          const thisYearEvent = new Date(
            now.getFullYear(),
            eventDate.getMonth(),
            eventDate.getDate()
          );
          return thisYearEvent >= now && thisYearEvent <= oneMonthFromNow;
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
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Event
        </Button>
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
              <Card key={event.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {event.event_type === 'birthday' ? (
                      <Cake className="w-6 h-6 text-pink-500 mt-1" />
                    ) : (
                      <Heart className="w-6 h-6 text-red-500 mt-1" />
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {event.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {event.people_involved}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                        {formatDate(event.event_date)}
                        {event.recurring_yearly && ' (Recurring)'}
                      </p>
                      {event.details && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                          {event.details}
                        </p>
                      )}
                      {event.notification_preferences.length > 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                          Reminders:{' '}
                          {event.notification_preferences
                            .map((p) => p.replace('_', ' '))
                            .join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingEvent(event)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDeleteEvent(event.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
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
              <Card key={event.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {event.event_type === 'birthday' ? (
                      <Cake className="w-6 h-6 text-pink-500 mt-1" />
                    ) : (
                      <Heart className="w-6 h-6 text-red-500 mt-1" />
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {event.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {event.people_involved}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                        {formatDate(event.event_date)}
                        {event.recurring_yearly && ' (Recurring)'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingEvent(event)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDeleteEvent(event.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
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
    </div>
  );
}
