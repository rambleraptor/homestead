'use client';

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
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create event',
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        subtitle="Yearly-recurring household events"
        actions={
          <Button
            onClick={() => setIsCreateOpen(true)}
            data-testid="add-event-button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Event
          </Button>
        }
      />

      <EventsList />

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
