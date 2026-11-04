/**
 * Health Home
 *
 * The user's own vaccine series and dose history — vaccine cards with
 * expandable histories, a due-soon strip, and delete confirmation. Adding
 * and editing a series or a dose happen at their own addresses
 * (`vaccines/new`, `vaccines/:id/edit`, `vaccines/:id/doses/new`,
 * `vaccines/:id/doses/:doseId/edit` — see `VaccineFormRoute` and
 * `DoseFormRoute`), so this page only links to them. Records are private
 * per user (see `resources.ts`), so everything on this page belongs to the
 * signed-in user only.
 */

import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, ShieldCheck } from 'lucide-react';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useVaccines } from '../hooks/useVaccines';
import { useDeleteVaccine } from '../hooks/useVaccineMutations';
import { useAllVaccinations } from '../hooks/useVaccinations';
import { useDeleteVaccination } from '../hooks/useVaccinationMutations';
import { VaccineCard } from './VaccineCard';
import { HEALTH_HOME, type HealthHomeLinkState } from './HealthFormPage';
import { isDueSatisfied, dueSoon, todayIso } from '../utils/due';
import type { Vaccination, Vaccine } from '../types';

type DeleteTarget =
  | { kind: 'vaccine'; vaccine: Vaccine }
  | { kind: 'dose'; vaccine: Vaccine; dose: Vaccination };

export function HealthHome() {
  const location = useLocation();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  // A dose form returns here naming the series it touched, so it opens with
  // the change visible.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => {
    const expand = (location.state as HealthHomeLinkState | null)?.expand;
    return new Set(expand ? [expand] : []);
  });

  const { data: vaccines, isLoading, isError, error, refetch } = useVaccines();
  const { dosesByVaccine, doseErrorsByVaccine } = useAllVaccinations(vaccines);

  const deleteVaccine = useDeleteVaccine();
  const deleteDose = useDeleteVaccination();

  // A series whose latest dose met its due date isn't waiting on anything.
  const needingAttention = useMemo(
    () =>
      dueSoon(vaccines ?? [], todayIso()).filter(
        (v) => !isDueSatisfied(v.next_due, dosesByVaccine.get(v.id)?.[0]?.date_administered),
      ),
    [vaccines, dosesByVaccine],
  );

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      <QueryError
        error={error}
        onRetry={() => void refetch()}
        title="Failed to load health records"
        data-testid="health-error"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Health"
        subtitle="Your vaccination records. Health records are private — only you can see yours."
        actions={
          <Link
            to={`${HEALTH_HOME}/vaccines/new`}
            data-testid="add-vaccine-button"
            className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium font-body transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            Add Vaccine
          </Link>
        }
      />

      {needingAttention.length > 0 && (
        <div
          data-testid="vaccines-due-soon"
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4"
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
        <EmptyState
          icon={ShieldCheck}
          title="No vaccines tracked yet"
          description="Add a vaccine (like Tdap or Influenza), then record each dose under it."
          action={{
            label: 'Add vaccine',
            onClick: () => navigate(`${HEALTH_HOME}/vaccines/new`),
            testId: 'vaccines-empty-add',
          }}
          assistantPrompt="Record my flu shot from October 2"
          data-testid="vaccines-empty"
        />
      ) : (
        <div data-testid="vaccines-list" className="space-y-3">
          {vaccines!.map((vaccine) => (
            <VaccineCard
              key={vaccine.id}
              vaccine={vaccine}
              doses={dosesByVaccine.get(vaccine.id)}
              dosesError={doseErrorsByVaccine.get(vaccine.id)}
              expanded={expandedIds.has(vaccine.id)}
              onToggle={toggleExpanded}
              onDelete={(v) => setDeleteTarget({ kind: 'vaccine', vaccine: v })}
              onDeleteDose={(v, dose) => setDeleteTarget({ kind: 'dose', vaccine: v, dose })}
            />
          ))}
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
