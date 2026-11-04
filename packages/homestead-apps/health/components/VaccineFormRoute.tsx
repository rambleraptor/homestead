/**
 * The vaccine (series) form at its own address: `vaccines/new` creates and
 * `vaccines/:id/edit` edits, under the Health app's base path. Saving or
 * cancelling returns to the Health home. The records are private per user
 * (`resources.ts`), so an edit address only ever loads the viewer's own
 * series — anyone else's id comes back as "not found".
 */

import { useNavigate } from 'react-router-dom';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { useVaccine } from '../hooks/useVaccines';
import { useCreateVaccine, useUpdateVaccine } from '../hooks/useVaccineMutations';
import { VaccineForm } from './VaccineForm';
import { HealthFormPage, HealthLoadError, HEALTH_HOME } from './HealthFormPage';
import type { VaccineFormData } from '../types';

export function VaccineFormRoute({ params }: AppRouteProps) {
  const id = params?.id;
  return id ? <EditVaccine vaccineId={id} /> : <NewVaccine />;
}

function NewVaccine() {
  const navigate = useNavigate();
  const createVaccine = useCreateVaccine();

  const handleSubmit = async (data: VaccineFormData) => {
    try {
      await createVaccine.mutateAsync({
        name: data.name,
        ...(data.next_due ? { next_due: data.next_due } : {}),
        ...(data.notes ? { notes: data.notes } : {}),
      });
      navigate(HEALTH_HOME);
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <HealthFormPage title="Add Vaccine" testId="vaccine-form-page">
      <VaccineForm
        onSubmit={handleSubmit}
        onCancel={() => navigate(HEALTH_HOME)}
        isSubmitting={createVaccine.isPending}
      />
    </HealthFormPage>
  );
}

function EditVaccine({ vaccineId }: { vaccineId: string }) {
  const navigate = useNavigate();
  const { data: vaccine, isLoading, isError, error } = useVaccine(vaccineId);
  const updateVaccine = useUpdateVaccine();

  const handleSubmit = async (data: VaccineFormData) => {
    try {
      // Merge-patch: null clears a field the user emptied.
      await updateVaccine.mutateAsync({
        id: vaccineId,
        data: {
          name: data.name,
          next_due: data.next_due || null,
          notes: data.notes || null,
        },
      });
      navigate(HEALTH_HOME);
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  if (isLoading) {
    return <SkeletonPage body="list" label="Loading vaccine" data-testid="health-loading" />;
  }

  if (isError || !vaccine) {
    return <HealthLoadError noun="vaccine" error={error} />;
  }

  return (
    <HealthFormPage title="Edit Vaccine" testId="vaccine-form-page">
      <VaccineForm
        onSubmit={handleSubmit}
        onCancel={() => navigate(HEALTH_HOME)}
        initialData={vaccine}
        isSubmitting={updateVaccine.isPending}
      />
    </HealthFormPage>
  );
}
