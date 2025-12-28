import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Cake, Heart, Plus, Upload, Search } from 'lucide-react';
import { Card } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Modal } from '@/shared/components/Modal';
import { Spinner } from '@/shared/components/Spinner';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { useToast } from '@/shared/components/ToastProvider';
import { getNextOccurrence, isUpcoming } from '@/shared/utils/dateUtils';
import { usePeople } from '../hooks/usePeople';
import { useCreatePerson } from '../hooks/useCreatePerson';
import { useUpdatePerson } from '../hooks/useUpdatePerson';
import { useDeletePerson } from '../hooks/useDeletePerson';
import { usePeopleStats } from '../hooks/usePeopleStats';
import { PersonForm } from './PersonForm';
import { PersonCard } from './PersonCard';
import type { Person, PersonFormData } from '../types';

export function PeopleHome() {
  const navigate = useNavigate();
  const { data: people, isLoading } = usePeople();
  const { data: stats } = usePeopleStats();
  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();
  const toast = useToast();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [nameFilter, setNameFilter] = useState('');
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

  const getUpcomingPeople = () => {
    if (!people) return [];

    return people
      .filter((person) => {
        const hasUpcomingBirthday = person.birthday && isUpcoming(new Date(person.birthday), 30);
        const hasUpcomingAnniversary = person.anniversary && isUpcoming(new Date(person.anniversary), 30);
        return hasUpcomingBirthday || hasUpcomingAnniversary;
      })
      .sort((a, b) => {
        const nextA = getNextOccurrence(a.birthday ? new Date(a.birthday) : new Date(a.anniversary!));
        const nextB = getNextOccurrence(b.birthday ? new Date(b.birthday) : new Date(b.anniversary!));
        return nextA.getTime() - nextB.getTime();
      });
  };

  const upcomingPeople = getUpcomingPeople();

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            People
          </h1>
          <p className="mt-2 text-gray-600">
            Track important dates and information about people you know
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/people/import')}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)} data-testid="add-person-button">
            <Plus className="w-4 h-4 mr-2" />
            Add Person
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="flex items-center">
              <Users className="w-8 h-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600">
                  Total People
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.totalPeople}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center">
              <Cake className="w-8 h-8 text-pink-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600">
                  Upcoming Birthdays
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.upcomingBirthdays}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center">
              <Heart className="w-8 h-8 text-red-500" />
              <div className="ml-4">
                <p className="text-sm text-gray-600">
                  Upcoming Anniversaries
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.upcomingAnniversaries}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Upcoming (Next 30 Days)
        </h2>
        {upcomingPeople.length === 0 ? (
          <Card>
            <p className="text-center text-gray-600 py-8">
              No upcoming birthdays or anniversaries in the next 30 days
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingPeople.map((person) => (
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
