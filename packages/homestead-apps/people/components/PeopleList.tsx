/**
 * People List Component
 *
 * Renders the people list with the shared `<FilterBar>` for client-side
 * filtering. Used by `PeopleHome`.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchX, Users } from 'lucide-react';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import {
  FilterBar,
  AppFiltersProvider,
  useAppFilterValues,
  useFilteredItems,
} from '@rambleraptor/homestead-core/shared/filters';
import { usePeople } from '../hooks/usePeople';
import { useUpdatePerson } from '../hooks/useUpdatePerson';
import { useDeletePerson } from '../hooks/useDeletePerson';
import { peopleApp } from '../app.config';
import { PersonForm } from './PersonForm';
import { PersonCard } from './PersonCard';
import type { Person, PersonFormData } from '../types';

interface PeopleListProps {
  /** Opens the add-person form — the empty state's call to action. */
  onAdd?: () => void;
}

export function PeopleList({ onAdd }: PeopleListProps) {
  const { data: people, isLoading, isError, error, refetch } = usePeople();

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
        title="Couldn’t load people"
        data-testid="people-error"
      />
    );
  }

  return (
    <AppFiltersProvider
      appId={peopleApp.id}
      decls={peopleApp.web?.filters ?? []}
      items={people ?? []}
    >
      <PeopleListInner hasAny={(people?.length ?? 0) > 0} onAdd={onAdd} />
    </AppFiltersProvider>
  );
}

function PeopleListInner({ hasAny, onAdd }: { hasAny: boolean; onAdd?: () => void }) {
  const filteredPeople = useFilteredItems<Person>();
  const { reset: clearFilters } = useAppFilterValues();
  const navigate = useNavigate();
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
      await updatePerson.mutateAsync({ id: editingPerson.id, data, previousUserId: editingPerson.user });
      setEditingPerson(null);
      toast.success('Person updated successfully!');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
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
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-brand-navy mb-4">
        All People
      </h2>
      <FilterBar />
      {!hasAny ? (
        <EmptyState
          icon={Users}
          title="No people yet"
          description="Keep birthdays, addresses and family in one place. Add someone, or import a list you already have."
          action={
            onAdd ? { label: 'Add a person', onClick: onAdd, testId: 'people-empty-add' } : undefined
          }
          secondaryAction={{
            label: 'Import',
            onClick: () => navigate('/people/import'),
            testId: 'people-empty-import',
          }}
          assistantPrompt="Add my mom to People — her birthday is March 3"
          data-testid="people-empty"
        />
      ) : filteredPeople.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No people match the current filters"
          description="Try a different filter, or clear them to see everyone."
          action={{ label: 'Clear filters', onClick: clearFilters, testId: 'people-filters-clear' }}
          data-testid="people-filtered-empty"
        />
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
