/**
 * Person form. State/validation/submission run through the shared
 * `useSchemaForm` engine. `partner_id`, the relative lists and `addresses`
 * aren't fields on the person resource (relatives and addresses live in sibling
 * collections), so they are managed as extra fields and passed straight through
 * in `buildPayload`.
 */

import { useSchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { TagInput } from '@rambleraptor/homestead-core/shared/components/TagInput';
import { ReferenceField } from '@rambleraptor/homestead-core/shared/components/ReferenceField';
import { useFavorites } from '@rambleraptor/homestead-core/shared/favorites';
import type { Person, PersonFormData, AddressFormData } from '../types';
import { usePeople } from '../hooks/usePeople';
import { PEOPLE, peopleResources } from '../resources';
import { personIdOf } from '../utils/relationships';
import { AddressesInput } from './AddressesInput';

const personDef = peopleResources.find((r) => r.singular === 'person')!;

// The relative pickers hold `people/{id}` paths (ReferenceField's shape); the
// form data carries bare ids.
const toPaths = (people: { id: string }[]) => people.map((p) => `${PEOPLE}/${p.id}`);
const toIds = (paths: unknown, selfId?: string) =>
  ((paths as string[]) ?? []).map(personIdOf).filter((id) => id !== selfId);

interface PersonFormProps {
  initialData?: Person;
  onSubmit: (data: PersonFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function PersonForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: PersonFormProps) {
  const { data: people = [] } = usePeople();
  const favorites = useFavorites('person');

  const initialAddresses: AddressFormData[] =
    initialData?.addresses?.map((addr) => ({
      id: addr.id,
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      state: addr.state,
      postal_code: addr.postal_code,
      country: addr.country,
      wifi_network: addr.wifi_network,
      wifi_password: addr.wifi_password,
    })) || [];

  const form = useSchemaForm<PersonFormData>({
    resource: personDef,
    initialData: {
      name: initialData?.name || '',
      aliases: initialData?.aliases || [],
      addresses: initialAddresses,
      partner_id: initialData?.partner?.id || '',
      parent_ids: toPaths(initialData?.parents ?? []),
      child_ids: toPaths(initialData?.children ?? []),
      sibling_ids: toPaths((initialData?.siblings ?? []).filter((s) => !s.inferred)),
    },
    onSubmit,
    fields: { name: { id: 'name' }, aliases: { id: 'aliases' } },
    extraFields: {
      addresses: { type: 'array' },
      partner_id: { type: 'string' },
      parent_ids: { type: 'array' },
      child_ids: { type: 'array' },
      sibling_ids: { type: 'array' },
    },
    buildPayload: (v) => ({
      name: v.name as string,
      aliases: v.aliases as string[],
      addresses: v.addresses as AddressFormData[],
      partner_id: v.partner_id as string,
      parent_ids: toIds(v.parent_ids, initialData?.id),
      child_ids: toIds(v.child_ids, initialData?.id),
      sibling_ids: toIds(v.sibling_ids, initialData?.id),
    }),
  });

  const busy = isSubmitting || form.isSubmitting;
  const partnerId = (form.values.partner_id as string) || '';
  // Filter out the current person from partner options.
  const availablePartners = people.filter((p) => p.id !== initialData?.id);

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <Input
          id="name"
          type="text"
          value={(form.values.name as string) ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => form.setValue('name', e.target.value)}
          required
        />
      </div>

      {/* Aliases */}
      <div>
        <label htmlFor="aliases" className="block text-sm font-medium text-gray-700 mb-1">
          Also known as
        </label>
        <TagInput
          id="aliases"
          value={(form.values.aliases as string[]) ?? []}
          onChange={(aliases) => form.setValue('aliases', aliases)}
          placeholder="Add an alternate name…"
          testId="person-aliases"
        />
        <p className="text-sm text-gray-500 mt-1">
          Alternate names (maiden name, nickname, middle name) used to match
          this person on receipts and imports.
        </p>
      </div>

      {/* Partner selection */}
      <div>
        <label htmlFor="partner" className="block text-sm font-medium text-gray-700 mb-1">
          Partner
        </label>
        <select
          id="partner"
          data-testid="person-partner-select"
          value={partnerId}
          onChange={(e) => form.setValue('partner_id', e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        >
          <option value="">No partner</option>
          {availablePartners.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <p className="text-sm text-gray-500 mt-1">
          Partners share an address. Track birthdays and anniversaries in
          the Events app.
        </p>
      </div>

      {/* Family */}
      <div className="space-y-4">
        {(
          [
            ['parent_ids', 'parents', 'Parents'],
            ['child_ids', 'children', 'Children'],
            ['sibling_ids', 'siblings', 'Siblings'],
          ] as const
        ).map(([field, group, label]) => (
          <ReferenceField
            key={field}
            id={field}
            testId={`person-${group}`}
            label={label}
            collection={PEOPLE}
            multiple
            value={(form.values[field] as string[]) ?? []}
            onChange={(next) => form.setValue(field, next)}
            favoriteIds={favorites.favoriteIds}
            onToggleFavorite={favorites.toggle}
            error={form.errors[field]}
          />
        ))}
        <p className="text-sm text-gray-500">
          People who share a parent show as siblings automatically.
        </p>
      </div>

      {/* Addresses - shown with indication if partner is selected */}
      <div className="border-t pt-4">
        <div className="mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Addresses {partnerId && '(Shared with Partner)'}
          </h3>
          {partnerId && (
            <p className="text-sm text-gray-500 mt-1">
              Partners share addresses. Changes will affect both people.
            </p>
          )}
        </div>
        <AddressesInput
          addresses={(form.values.addresses as AddressFormData[]) ?? []}
          onChange={(addresses) => form.setValue('addresses', addresses)}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={busy} data-testid="person-form-submit">
          {busy ? 'Saving...' : initialData ? 'Update' : 'Create'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
