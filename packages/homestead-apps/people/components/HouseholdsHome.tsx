/**
 * Households page (`/people/households`): every household with its address,
 * WiFi and members, plus create / edit / delete.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Edit, Plus, Trash2 } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import {
  useCreateHousehold,
  useDeleteHousehold,
  useHouseholds,
  useUpdateHousehold,
} from '../hooks/useHouseholds';
import { usePeople } from '../hooks/usePeople';
import type { Household, HouseholdFormData } from '../types';
import { memberIds } from '../utils/households';
import { HouseholdForm } from './HouseholdForm';
import { HouseholdSummary } from './HouseholdSummary';

export function HouseholdsHome() {
  const { data: households = [], isLoading, isError } = useHouseholds();
  const { data: people = [] } = usePeople();
  const createHousehold = useCreateHousehold();
  const updateHousehold = useUpdateHousehold();
  const deleteHousehold = useDeleteHousehold();
  const toast = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [editing, setEditing] = useState<Household | null>(null);
  const [deleting, setDeleting] = useState<Household | null>(null);

  const nameById = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  const handleCreate = async (data: HouseholdFormData) => {
    try {
      await createHousehold.mutateAsync(data);
      setIsCreating(false);
      toast.success('Household created');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleUpdate = async (data: HouseholdFormData) => {
    if (!editing) return;
    try {
      await updateHousehold.mutateAsync({ id: editing.id, data });
      setEditing(null);
      toast.success('Household updated');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteHousehold.mutateAsync(deleting.id);
      setDeleting(null);
      toast.success('Household deleted');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to="/people"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to People
      </Link>

      <PageHeader
        title="Households"
        subtitle="Homes shared by groups of people: their address and WiFi"
        actions={
          <Button onClick={() => setIsCreating(true)} data-testid="add-household-button">
            <Plus className="w-4 h-4 mr-2" />
            Add Household
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <Card>
          <p className="text-center text-red-600 py-8" data-testid="households-error">
            Households could not be loaded.
          </p>
        </Card>
      ) : households.length === 0 ? (
        <Card>
          <p className="text-center text-gray-600 py-8" data-testid="households-empty">
            No households yet. Add one to share an address and WiFi between people.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {households.map((household) => {
            const members = memberIds(household)
              .map((id) => ({ id, name: nameById.get(id) }))
              .filter((m): m is { id: string; name: string } => !!m.name);
            return (
              <Card key={household.id}>
                <div className="flex items-start justify-between" data-testid={`household-${household.id}`}>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-gray-900">{household.name}</h3>
                    <HouseholdSummary household={household} />
                    <div
                      className="flex flex-wrap gap-x-3 text-sm"
                      data-testid={`household-members-${household.id}`}
                    >
                      {members.length === 0 ? (
                        <span className="text-gray-500 italic">No members</span>
                      ) : (
                        members.map((m) => (
                          <Link
                            key={m.id}
                            to={`/people/${m.id}`}
                            className="text-brand-navy hover:underline"
                          >
                            {m.name}
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing(household)}
                      aria-label={`Edit ${household.name}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDeleting(household)}
                      aria-label={`Delete ${household.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="Create Household">
        <HouseholdForm
          onSubmit={handleCreate}
          onCancel={() => setIsCreating(false)}
          isSubmitting={createHousehold.isPending}
        />
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Household">
        {editing && (
          <HouseholdForm
            initialData={editing}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
            isSubmitting={updateHousehold.isPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete Household"
        message={`Delete "${deleting?.name}"? Its members stay; only the household and its address are removed.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteHousehold.isPending}
      />
    </div>
  );
}
