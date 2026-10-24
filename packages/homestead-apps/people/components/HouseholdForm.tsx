/**
 * Household form: name, members and the household's address + WiFi. Runs on
 * the shared `useSchemaForm` engine; members are held as `people/{id}` paths
 * (ReferenceField's shape) and submitted as bare ids.
 */

import { useSchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { ReferenceField } from '@rambleraptor/homestead-core/shared/components/ReferenceField';
import { useFavorites } from '@rambleraptor/homestead-core/shared/favorites';
import { PEOPLE, peopleResources } from '../resources';
import type { Household, HouseholdFormData } from '../types';
import { memberIds } from '../utils/households';
import { personIdOf } from '../utils/relationships';
import { HouseholdAddressFields } from './HouseholdAddressFields';

const householdDef = peopleResources.find((r) => r.singular === 'household')!;

interface HouseholdFormProps {
  initialData?: Household;
  onSubmit: (data: HouseholdFormData) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function HouseholdForm({ initialData, onSubmit, onCancel, isSubmitting }: HouseholdFormProps) {
  const favorites = useFavorites('person');

  const form = useSchemaForm<HouseholdFormData>({
    resource: householdDef,
    initialData: {
      name: initialData?.name ?? '',
      members: initialData ? memberIds(initialData).map((id) => `${PEOPLE}/${id}`) : [],
      line1: initialData?.line1 ?? '',
      wifi_network: initialData?.wifi_network ?? '',
      wifi_password: initialData?.wifi_password ?? '',
    },
    onSubmit,
    fields: { name: { id: 'household-name' } },
    buildPayload: (v) => ({
      name: v.name as string,
      members: ((v.members as string[]) ?? []).map(personIdOf),
      line1: (v.line1 as string) || undefined,
      wifi_network: (v.wifi_network as string) || undefined,
      // A password without a network can't be used; drop it with the network.
      wifi_password: v.wifi_network ? (v.wifi_password as string) || undefined : undefined,
    }),
  });

  const busy = isSubmitting || form.isSubmitting;

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6" data-testid="household-form">
      <div>
        <label htmlFor="household-name" className="block text-sm font-medium text-gray-700 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <Input
          id="household-name"
          type="text"
          value={(form.values.name as string) ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => form.setValue('name', e.target.value)}
          placeholder="The Smiths, Lake house…"
          required
        />
        {form.errors.name && <p className="mt-1 text-sm text-red-600">{form.errors.name}</p>}
      </div>

      <ReferenceField
        id="household-members"
        testId="household-members"
        label="Members"
        collection={PEOPLE}
        multiple
        value={(form.values.members as string[]) ?? []}
        onChange={(next) => form.setValue('members', next)}
        favoriteIds={favorites.favoriteIds}
        onToggleFavorite={favorites.toggle}
        error={form.errors.members}
      />

      <HouseholdAddressFields
        idPrefix="household"
        value={{
          line1: form.values.line1 as string,
          wifi_network: form.values.wifi_network as string,
          wifi_password: form.values.wifi_password as string,
        }}
        onChange={(field, value) => form.setValue(field, value)}
      />

      {form.formError && <p className="text-sm text-red-600">{form.formError}</p>}

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={busy} data-testid="household-form-submit">
          {busy ? 'Saving...' : initialData ? 'Update' : 'Create'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
