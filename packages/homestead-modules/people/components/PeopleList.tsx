'use client';

/**
 * People List Component
 *
 * Renders the people list with the shared `<FilterBar>` for client-side
 * filtering. Used by `PeopleHome` and by the omnibox list view — it
 * deliberately omits the page header and "Add Person" button so the
 * omnibox doesn't render chrome that belongs to the module's full home
 * page.
 */

import { useState } from 'react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import {
  FilterBar,
  ModuleFiltersProvider,
  useFilteredItems,
  useOmniboxFilterSeed,
} from '@rambleraptor/homestead-core/shared/filters';
import { usePeople } from '../hooks/usePeople';
import { useUpdatePerson } from '../hooks/useUpdatePerson';
import { useDeletePerson } from '../hooks/useDeletePerson';
import { peopleModule } from '../module.config';
import { PersonForm } from './PersonForm';
import { PersonCard } from './PersonCard';
import type { Person, PersonFormData } from '../types';

export function PeopleList() {
  const { data: people, isLoading } = usePeople();
  const seed = useOmniboxFilterSeed();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <ModuleFiltersProvider
      moduleId={peopleModule.id}
      decls={peopleModule.filters ?? []}
      items={people ?? []}
      initialValues={seed}
    >
      <PeopleListInner hasAny={(people?.length ?? 0) > 0} />
    </ModuleFiltersProvider>
  );
}

function PeopleListInner({ hasAny }: { hasAny: boolean }) {
  const filteredPeople = useFilteredItems<Person>();
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();
  const toast = useToast();

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    personId: string | null;
    personName: string | null;
  }>({ isOpen: false, personId: null, personName: null });

  const handleUpdatePerson = async (data: PersonFormData) => {
    if (!editingPerson) {
      return;
    }

    try {
      await updatePerson.mutateAsync({ id: editingPerson.id, data });
      setEditingPerson(null);
      toast.success('Person updated successfully!');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update person. Please try again.'
      );
    }
  };

  const handleDeleteClick = (person: Person) => {
    setDeleteConfirmation({
      isOpen: true,
      personId: person.id,
      personName: person.name,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.personId) return;

    try {
      await deletePerson.mutateAsync(deleteConfirmation.personId);
      setDeleteConfirmation({ isOpen: false, personId: null, personName: null });
      toast.success('Person deleted successfully!');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete person. Please try again.'
      );
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        All People
      </h2>
      <FilterBar />
      {!hasAny ? (
        <Card>
          <p className="text-center text-gray-600 py-8">
            No people yet. Add your first person to get started!
          </p>
        </Card>
      ) : filteredPeople.length === 0 ? (
        <Card>
          <p className="text-center text-gray-600 py-8">
            No people match the current filters
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredPeople.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              onEdit={setEditingPerson}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={!!editingPerson}
        onClose={() => setEditingPerson(null)}
        title="Edit Person"
      >
        {editingPerson && (
          <PersonForm
            initialData={editingPerson}
            onSubmit={handleUpdatePerson}
            onCancel={() => setEditingPerson(null)}
            isSubmitting={updatePerson.isPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={() =>
          setDeleteConfirmation({ isOpen: false, personId: null, personName: null })
        }
        onConfirm={handleDeleteConfirm}
        title="Delete Person"
        message={`Are you sure you want to delete "${deleteConfirmation.personName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deletePerson.isPending}
      />
    </div>
  );
}
