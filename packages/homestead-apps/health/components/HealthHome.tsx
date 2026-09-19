/**
 * Health Home
 *
 * The user's own vaccine series and dose history — vaccine cards with
 * expandable histories, inline create/edit forms for both levels, a
 * due-soon strip, and delete confirmation. Records are private per user
 * (see `resources.ts`), so everything on this page belongs to the
 * signed-in user only.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, Plus, ShieldCheck } from 'lucide-react';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { useVaccines } from '../hooks/useVaccines';
import {
  useCreateVaccine,
  useDeleteVaccine,
  useUpdateVaccine,
} from '../hooks/useVaccineMutations';
import { useAllVaccinations } from '../hooks/useVaccinations';
import {
  useCreateVaccination,
  useDeleteVaccination,
  useUpdateVaccination,
} from '../hooks/useVaccinationMutations';
import { VaccineForm } from './VaccineForm';
import { VaccinationForm } from './VaccinationForm';
import { VaccineCard } from './VaccineCard';
import { dueSoon, todayIso } from '../utils/due';
import type { Vaccination, VaccinationFormData, Vaccine, VaccineFormData } from '../types';

type View = 'list' | 'vaccine-form' | 'dose-form';

type DeleteTarget =
  | { kind: 'vaccine'; vaccine: Vaccine }
  | { kind: 'dose'; vaccine: Vaccine; dose: Vaccination };

export function HealthHome() {
  const [view, setView] = useState<View>('list');
  const [editingVaccine, setEditingVaccine] = useState<Vaccine | null>(null);
  const [doseContext, setDoseContext] = useState<{
    vaccine: Vaccine;
    dose: Vaccination | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const { data: vaccines, isLoading, isError, error } = useVaccines();
  const { dosesByVaccine } = useAllVaccinations(vaccines);

  const createVaccine = useCreateVaccine();
  const updateVaccine = useUpdateVaccine();
  const deleteVaccine = useDeleteVaccine();
  const createDose = useCreateVaccination();
  const updateDose = useUpdateVaccination();
  const deleteDose = useDeleteVaccination();

  const needingAttention = useMemo(
    () => dueSoon(vaccines ?? [], todayIso()),
    [vaccines],
  );

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const backToList = () => {
    setView('list');
    setEditingVaccine(null);
    setDoseContext(null);
  };

  const handleVaccineSubmit = async (data: VaccineFormData) => {
    try {
      if (editingVaccine) {
        // Merge-patch: null clears a field the user emptied.
        await updateVaccine.mutateAsync({
          id: editingVaccine.id,
          data: {
            name: data.name,
            next_due: data.next_due || null,
            notes: data.notes || null,
          },
        });
      } else {
        await createVaccine.mutateAsync({
          name: data.name,
          ...(data.next_due ? { next_due: data.next_due } : {}),
          ...(data.notes ? { notes: data.notes } : {}),
        });
      }
      backToList();
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleDoseSubmit = async (data: VaccinationFormData) => {
    if (!doseContext) return;
    const vaccineId = doseContext.vaccine.id;
    try {
      if (doseContext.dose) {
        await updateDose.mutateAsync({ vaccineId, id: doseContext.dose.id, data });
      } else {
        await createDose.mutateAsync({ vaccineId, data });
      }
      // Land back on the list with this series open, so the change is visible.
      setExpandedIds((prev) => new Set(prev).add(vaccineId));
      backToList();
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'vaccine') {
      await deleteVaccine.mutateAsync(deleteTarget.vaccine.id);
    } else {
      await deleteDose.mutateAsync({
        vaccineId: deleteTarget.vaccine.id,
        id: deleteTarget.dose.id,
      });
    }
    setDeleteTarget(null);
  };

  if (isLoading) {
    return (
      <SkeletonPage body="cards" label="Loading health records" data-testid="health-loading" />
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50/20 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Failed to load health records</h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {view === 'list' && (
        <>
          <PageHeader
            title="Health"
            subtitle="Your vaccination records. Health records are private — only you can see yours."
            actions={
              <button
                onClick={() => {
                  setEditingVaccine(null);
                  setView('vaccine-form');
                }}
                data-testid="add-vaccine-button"
                className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium font-body transition-colors shadow-sm"
              >
                <Plus className="w-5 h-5" />
                Add Vaccine
              </button>
            }
          />

          {needingAttention.length > 0 && (
            <div
              data-testid="vaccines-due-soon"
              className="bg-amber-50 border border-amber-200 rounded-lg p-4"
            >
              <h2 className="font-semibold text-amber-900 mb-2">Due soon</h2>
              <ul className="space-y-1">
                {needingAttention.map((v) => (
                  <li key={v.id} className="text-sm text-amber-800">
                    <span className="font-medium">{v.name}</span>
                    {' — next dose due '}
                    {v.next_due}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(vaccines?.length ?? 0) === 0 ? (
            <div
              data-testid="vaccines-empty"
              className="bg-white rounded-lg border border-gray-200 p-10 text-center"
            >
              <ShieldCheck className="w-10 h-10 text-text-muted mx-auto mb-3" aria-hidden="true" />
              <h2 className="font-semibold text-brand-navy mb-1">No vaccines tracked yet</h2>
              <p className="text-sm text-text-muted">
                Add a vaccine (like Tdap or Influenza), then record each dose under it.
              </p>
            </div>
          ) : (
            <div data-testid="vaccines-list" className="space-y-3">
              {vaccines!.map((vaccine) => (
                <VaccineCard
                  key={vaccine.id}
                  vaccine={vaccine}
                  doses={dosesByVaccine.get(vaccine.id)}
                  expanded={expandedIds.has(vaccine.id)}
                  onToggle={toggleExpanded}
                  onEdit={(v) => {
                    setEditingVaccine(v);
                    setView('vaccine-form');
                  }}
                  onDelete={(v) => setDeleteTarget({ kind: 'vaccine', vaccine: v })}
                  onAddDose={(v) => {
                    setDoseContext({ vaccine: v, dose: null });
                    setView('dose-form');
                  }}
                  onEditDose={(v, dose) => {
                    setDoseContext({ vaccine: v, dose });
                    setView('dose-form');
                  }}
                  onDeleteDose={(v, dose) =>
                    setDeleteTarget({ kind: 'dose', vaccine: v, dose })
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {view === 'vaccine-form' && (
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            {editingVaccine ? 'Edit Vaccine' : 'Add Vaccine'}
          </h2>
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <VaccineForm
              onSubmit={handleVaccineSubmit}
              onCancel={backToList}
              initialData={editingVaccine ?? undefined}
              isSubmitting={createVaccine.isPending || updateVaccine.isPending}
            />
          </div>
        </div>
      )}

      {view === 'dose-form' && doseContext && (
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            {doseContext.dose
              ? `Edit ${doseContext.vaccine.name} Dose`
              : `Add ${doseContext.vaccine.name} Dose`}
          </h2>
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <VaccinationForm
              vaccineId={doseContext.vaccine.id}
              onSubmit={handleDoseSubmit}
              onCancel={backToList}
              initialData={doseContext.dose ?? undefined}
              isSubmitting={createDose.isPending || updateDose.isPending}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={deleteTarget?.kind === 'vaccine' ? 'Delete Vaccine' : 'Delete Dose'}
        message={
          deleteTarget?.kind === 'vaccine'
            ? `Delete ${deleteTarget.vaccine.name} and its entire dose history? This action cannot be undone.`
            : 'Delete this dose record? This action cannot be undone.'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteVaccine.isPending || deleteDose.isPending}
      />
    </div>
  );
}
