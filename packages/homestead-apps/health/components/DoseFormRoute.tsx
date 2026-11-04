/**
 * The dose form at its own address under its series:
 * `vaccines/:id/doses/new` records a dose and `vaccines/:id/doses/:doseId/edit`
 * edits one. Both need the series (for its name, and to know whether it was
 * overdue) and the edit needs the dose, so the page loads them from the
 * address and shows the form once they're in — a reload keeps the form.
 *
 * Saving returns to the Health home with the series held open, so the
 * change is visible. A dose that completes its series ("2 of 2") or clears
 * an Overdue badge is celebrated — once, here, from the mutation's success
 * in this tab (`doseCelebration` decides).
 */

import { useNavigate } from 'react-router-dom';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { haptic } from '@rambleraptor/homestead-core/shared/haptics';
import { useVaccine } from '../hooks/useVaccines';
import { useVaccinations } from '../hooks/useVaccinations';
import { useCreateVaccination, useUpdateVaccination } from '../hooks/useVaccinationMutations';
import { doseCelebration } from '../utils/celebration';
import { todayIso } from '../utils/due';
import { VaccinationForm } from './VaccinationForm';
import {
  HealthFormPage,
  HealthLoadError,
  HEALTH_HOME,
  type HealthHomeLinkState,
} from './HealthFormPage';
import type { VaccinationFormData } from '../types';

export function DoseFormRoute({ params }: AppRouteProps) {
  const vaccineId = params?.id ?? '';
  const doseId = params?.doseId;
  const navigate = useNavigate();
  const toast = useToast();
  const vaccineQuery = useVaccine(vaccineId || null);
  const dosesQuery = useVaccinations(vaccineId || null);
  const createDose = useCreateVaccination();
  const updateDose = useUpdateVaccination();

  const vaccine = vaccineQuery.data;
  const doses = dosesQuery.data;
  const dose = doseId ? doses?.find((d) => d.id === doseId) : undefined;

  const backToSeries = () =>
    navigate(HEALTH_HOME, { state: { expand: vaccineId } satisfies HealthHomeLinkState });

  const handleSubmit = async (data: VaccinationFormData) => {
    if (!vaccine) return;
    try {
      if (dose) {
        await updateDose.mutateAsync({ vaccineId, id: dose.id, data });
      } else {
        await createDose.mutateAsync({ vaccineId, data });
        const celebration = doseCelebration({
          vaccine,
          existingDoses: doses ?? [],
          dose: data,
          todayIso: todayIso(),
        });
        if (celebration) {
          haptic('success');
          toast.celebrate(celebration.title, { description: celebration.description });
        }
      }
      backToSeries();
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  if (vaccineQuery.isLoading || dosesQuery.isLoading) {
    return <SkeletonPage body="list" label="Loading dose" data-testid="health-loading" />;
  }

  if (vaccineQuery.isError || !vaccine) {
    return <HealthLoadError noun="vaccine" error={vaccineQuery.error} />;
  }

  if (dosesQuery.isError || (doseId && !dose)) {
    return <HealthLoadError noun="dose" error={dosesQuery.error} />;
  }

  return (
    <HealthFormPage
      title={dose ? `Edit ${vaccine.name} Dose` : `Add ${vaccine.name} Dose`}
      testId="dose-form-page"
    >
      <VaccinationForm
        vaccineId={vaccineId}
        onSubmit={handleSubmit}
        onCancel={backToSeries}
        initialData={dose}
        isSubmitting={createDose.isPending || updateDose.isPending}
      />
    </HealthFormPage>
  );
}
