/**
 * The Events page: the household's yearly-recurring dates.
 *
 * It briefly grew a second tab, when reminders lived here and had enough volume
 * to need their own list. They don't live here any more — a reminder is a
 * `scheduled-notification` now, and the notifications app owns both what has
 * been delivered and what is queued. So this is one page again, which is what
 * it should have been the whole time: an events app that owns events.
 *
 * What events still contribute to reminders is `event-reminder`, the per-user
 * opt-in on each card, and the `events-materialize-reminders` cron that turns
 * those opt-ins into queued notifications. Neither needs a surface here beyond
 * the control on the event itself.
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useCreateEvent } from '../hooks/useCreateEvent';
import { EventForm } from './EventForm';
import { EventsList } from './EventsList';
import type { EventFormData } from '../types';

export function EventsHome() {
  const createEvent = useCreateEvent();
  const toast = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleCreate = async (data: EventFormData) => {
    try {
      await createEvent.mutateAsync(data);
      setIsCreateOpen(false);
      toast.success('Event created');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        subtitle="Yearly-recurring household events"
        actions={
          <Button onClick={() => setIsCreateOpen(true)} data-testid="add-event-button">
            <Plus className="w-4 h-4 mr-2" />
            Add Event
          </Button>
        }
      />

      <EventsList onAddEvent={() => setIsCreateOpen(true)} />

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Event"
      >
        <EventForm
          onSubmit={handleCreate}
          onCancel={() => setIsCreateOpen(false)}
          isSubmitting={createEvent.isPending}
        />
      </Modal>
    </div>
  );
}
