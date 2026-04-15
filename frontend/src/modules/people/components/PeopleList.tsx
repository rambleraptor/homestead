'use client';

/**
 * People List Component
 *
 * Renders the searchable list of people with per-row edit / delete. Used by
 * `PeopleHome` and by the omnibox list view — it deliberately omits the page
 * header and the "Add Person" button so the omnibox doesn't render chrome
 * that belongs to the module's full home page.
 */

import { useState } from 'react';
import { Search } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Input } from '@/shared/components/Input';
import { Modal } from '@/shared/components/Modal';
import { Spinner } from '@/shared/components/Spinner';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { useToast } from '@/shared/components/ToastProvider';
import { useOmniboxFilter } from '@/shared/omnibox/OmniboxContext';
import { usePeople } from '../hooks/usePeople';
import { useUpdatePerson } from '../hooks/useUpdatePerson';
import { useDeletePerson } from '../hooks/useDeletePerson';
import { PersonForm } from './PersonForm';
import { PersonCard } from './PersonCard';
import type { Person, PersonFormData } from '../types';

export function PeopleList() {
  const { data: people, isLoading } = usePeople();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();
  const toast = useToast();

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
