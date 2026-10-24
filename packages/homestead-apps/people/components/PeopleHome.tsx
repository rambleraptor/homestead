import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Home, Plus, Upload } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useCreatePerson } from '../hooks/useCreatePerson';
import { PersonForm } from './PersonForm';
import { PeopleList } from './PeopleList';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import type { PersonFormData } from '../types';

export function PeopleHome() {
  const navigate = useNavigate();
  const createPerson = useCreatePerson();
  const toast = useToast();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const handleCreatePerson = async (data: PersonFormData) => {
    try {
      await createPerson.mutateAsync(data);
      setIsCreateModalOpen(false);
      toast.success('Person created successfully!');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        subtitle="Track important dates and information about people you know"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => navigate('/people/households')}
              data-testid="households-link"
            >
              <Home className="w-4 h-4 mr-2" />
              Households
            </Button>
            <Button variant="secondary" onClick={() => navigate('/people/import')}>
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
            <Button variant="secondary" onClick={() => navigate('/people/export')}>
              <Download className="w-4 h-4 mr-2" />
              Export
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
