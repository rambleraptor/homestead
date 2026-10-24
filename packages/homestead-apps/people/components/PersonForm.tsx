/**
 * Person form. State/validation/submission run through the shared
 * `useSchemaForm` engine. `partner_id`, the relative lists, the household
 * picker and the "New household" shortcut aren't fields on the person resource
 * (relatives and households live in sibling collections), so they are managed
 * as extra fields and folded into `PersonFormData` in `buildPayload`.
 */

import { useSchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { TagInput } from '@rambleraptor/homestead-core/shared/components/TagInput';
import { ReferenceField } from '@rambleraptor/homestead-core/shared/components/ReferenceField';
import { useFavorites } from '@rambleraptor/homestead-core/shared/favorites';
import { Plus, X } from 'lucide-react';
import type { Person, PersonFormData } from '../types';
import { usePeople } from '../hooks/usePeople';
import { HOUSEHOLDS, PEOPLE, peopleResources } from '../resources';
import { personIdOf } from '../utils/relationships';
import { HouseholdAddressFields } from './HouseholdAddressFields';

const personDef = peopleResources.find((r) => r.singular === 'person')!;

// The relative pickers hold `people/{id}` paths (ReferenceField's shape); the
// form data carries bare ids.
const toPaths = (people: { id: string }[]) => people.map((p) => `${PEOPLE}/${p.id}`);
const toIds = (paths: unknown, selfId?: string) =>
  ((paths as string[]) ?? []).map(personIdOf).filter((id) => id !== selfId);
const householdIdOf = (path: string) =>
  path.startsWith(`${HOUSEHOLDS}/`) ? path.slice(HOUSEHOLDS.length + 1) : path;
const text = (v: unknown) => ((v as string) ?? '').trim() || undefined;

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

  const form = useSchemaForm<PersonFormData>({
    resource: personDef,
    initialData: {
      name: initialData?.name || '',
      aliases: initialData?.aliases || [],
      household_ids: (initialData?.households ?? []).map((h) => `${HOUSEHOLDS}/${h.id}`),
      partner_id: initialData?.partner?.id || '',
      parent_ids: toPaths(initialData?.parents ?? []),
      child_ids: toPaths(initialData?.children ?? []),
      sibling_ids: toPaths((initialData?.siblings ?? []).filter((s) => !s.inferred)),
    },
    onSubmit,
    fields: { name: { id: 'name' }, aliases: { id: 'aliases' } },
    extraFields: {
      household_ids: { type: 'array' },
      new_household_open: { type: 'boolean' },
      new_household_name: {
        type: 'string',
        validate: (value, values) =>
          values.new_household_open && !text(value) ? 'Household name is required' : null,
      },
      new_household_line1: { type: 'string' },
      new_household_wifi_network: { type: 'string' },
      new_household_wifi_password: { type: 'string' },
      partner_id: { type: 'string' },
      parent_ids: { type: 'array' },
      child_ids: { type: 'array' },
      sibling_ids: { type: 'array' },
    },
    buildPayload: (v) => ({
      name: v.name as string,
      aliases: v.aliases as string[],
      household_ids: ((v.household_ids as string[]) ?? []).map(householdIdOf),
      new_household: v.new_household_open
        ? {
            name: text(v.new_household_name) ?? '',
            line1: text(v.new_household_line1),
            wifi_network: text(v.new_household_wifi_network),
            wifi_password: text(v.new_household_wifi_network)
              ? text(v.new_household_wifi_password)
              : undefined,
          }
        : undefined,
      partner_id: v.partner_id as string,
      parent_ids: toIds(v.parent_ids, initialData?.id),
      child_ids: toIds(v.child_ids, initialData?.id),
      sibling_ids: toIds(v.sibling_ids, initialData?.id),
    }),
  });

  const busy = isSubmitting || form.isSubmitting;
  const partnerId = (form.values.partner_id as string) || '';
  const newHouseholdOpen = !!form.values.new_household_open;
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
          Track birthdays and anniversaries in the Events app.
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

      {/* Households */}
      <div className="border-t pt-4 space-y-3">
        <ReferenceField
          id="household_ids"
          testId="person-households"
          label="Households"
          collection={HOUSEHOLDS}
          multiple
          value={(form.values.household_ids as string[]) ?? []}
          onChange={(next) => form.setValue('household_ids', next)}
          description="Members of a household share its address and WiFi."
          error={form.errors.household_ids}
          emptyMessage="No households yet"
        />

        {newHouseholdOpen ? (
          <div
            className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3"
            data-testid="new-household"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-700">New household</h4>
              <button
                type="button"
                onClick={() => form.setValue('new_household_open', false)}
                className="text-gray-500 hover:text-gray-700"
                aria-label="Cancel new household"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label
                htmlFor="new-household-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="new-household-name"
                type="text"
                value={(form.values.new_household_name as string) ?? ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  form.setValue('new_household_name', e.target.value)
                }
                placeholder="The Smiths, Lake house…"
              />
              {form.errors.new_household_name && (
                <p className="mt-1 text-sm text-red-600">{form.errors.new_household_name}</p>
              )}
            </div>
            <HouseholdAddressFields
              idPrefix="new-household"
              value={{
                line1: form.values.new_household_line1 as string,
                wifi_network: form.values.new_household_wifi_network as string,
                wifi_password: form.values.new_household_wifi_password as string,
              }}
              onChange={(field, value) => form.setValue(`new_household_${field}`, value)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              form.setValues({
                new_household_open: true,
                new_household_name:
                  (form.values.new_household_name as string) || (form.values.name as string) || '',
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
            data-testid="new-household-button"
          >
            <Plus className="w-4 h-4" />
            New household
          </button>
        )}
      </div>

      {form.formError && <p className="text-sm text-red-600">{form.formError}</p>}

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
