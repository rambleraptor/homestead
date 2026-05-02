'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useCreatePerson } from '../hooks/useCreatePerson';
import { PersonForm } from './PersonForm';
import { PeopleList } from './PeopleList';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import type { PersonFormData } from '../types';

export function PeopleHome() {
  const router = useRouter();
  const createPerson = useCreatePerson();
  const toast = useToast();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const handleCreatePerson = async (data: PersonFormData) => {
    try {
      await createPerson.mutateAsync(data);
      setIsCreateModalOpen(false);
      toast.success('Person created successfully!');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to create person. Please try again.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        subtitle="Track important dates and information about people you know"
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push('/people/import')}>
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
            <Button onClick={() => setIsCreateModalOpen(true)} data-testid="add-person-button">
              <Plus className="w-4 h-4 mr-2" />
              Add Person
            </Button>
          </>
        }
      />

      <PeopleList />

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Person"
      >
        <PersonForm
          onSubmit={handleCreatePerson}
          onCancel={() => setIsCreateModalOpen(false)}
          isSubmitting={createPerson.isPending}
        />
      </Modal>
    </div>
  );
}
