'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Search } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Modal } from '@/shared/components/Modal';
import { Spinner } from '@/shared/components/Spinner';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { useToast } from '@/shared/components/ToastProvider';
import { useOmniboxFilter } from '@/shared/omnibox/OmniboxContext';
import { usePeople } from '../hooks/usePeople';
import { useCreatePerson } from '../hooks/useCreatePerson';
import { useUpdatePerson } from '../hooks/useUpdatePerson';
import { useDeletePerson } from '../hooks/useDeletePerson';
import { PersonForm } from './PersonForm';
import { PersonCard } from './PersonCard';
import { PageHeader } from '@/shared/components/PageHeader';
import type { Person, PersonFormData } from '../types';

export function PeopleHome() {
  const router = useRouter();
  const { data: people, isLoading } = usePeople();
  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();
  const toast = useToast();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [nameFilter, setNameFilter] = useState('');

  // Seed the name filter from an omnibox intent (no-op on the normal
  // /people route where there is no omnibox context).
  useOmniboxFilter((filters) => {
    if (typeof filters.name === 'string') {
      setNameFilter(filters.name);
    }
  });

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    personId: string | null;
    personName: string | null;
  }>({ isOpen: false, personId: null, personName: null });

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


  const filteredPeople = people?.filter((person) => {
    if (!nameFilter.trim()) return true;

    const searchTerms = nameFilter.toLowerCase().trim().split(/\s+/);
    const nameWords = person.name.toLowerCase().split(/\s+/);

    // Match if every search term matches at least one word in the name
    return searchTerms.every(searchTerm =>
      nameWords.some(nameWord => nameWord.includes(searchTerm))
    );
  }) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

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

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          All People
        </h2>
        <div className="mb-4 relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-gray-400" />
          </div>
          <Input
            type="text"
            placeholder="Search people by name..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="pl-10"
            data-testid="people-name-filter"
          />
        </div>
        {!people || people.length === 0 ? (
          <Card>
            <p className="text-center text-gray-600 py-8">
              No people yet. Add your first person to get started!
            </p>
          </Card>
        ) : filteredPeople.length === 0 ? (
          <Card>
            <p className="text-center text-gray-600 py-8">
              No people found matching "{nameFilter}"
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
      </div>

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
