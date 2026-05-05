'use client';

import { useState } from 'react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import type { Person, PersonFormData, AddressFormData } from '../types';
import { usePeople } from '../hooks/usePeople';
import { AddressesInput } from './AddressesInput';

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

  // Convert existing addresses to form data format
  const initialAddresses: AddressFormData[] = initialData?.addresses?.map(addr => ({
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

  const [formData, setFormData] = useState<PersonFormData>({
    name: initialData?.name || '',
    addresses: initialAddresses,
    partner_id: initialData?.partner?.id || '',
  });

  // Filter out the current person from partner options
  const availablePartners = people.filter(p => p.id !== initialData?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Name <span className="text-red-500">*</span>
        </label>
        <Input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFormData({ ...formData, name: e.target.value })
          }
          required
        />
      </div>

      {/* Partner selection */}
      <div>
        <label
          htmlFor="partner"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Partner
        </label>
        <select
          id="partner"
          value={formData.partner_id || ''}
          onChange={(e) =>
            setFormData({ ...formData, partner_id: e.target.value })
          }
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
          the Events module.
        </p>
      </div>

      {/* Addresses - shown with indication if partner is selected */}
      <div className="border-t pt-4">
        <div className="mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Addresses {formData.partner_id && '(Shared with Partner)'}
          </h3>
          {formData.partner_id && (
            <p className="text-sm text-gray-500 mt-1">
              Partners share addresses. Changes will affect both people.
            </p>
          )}
        </div>
        <AddressesInput
          addresses={formData.addresses}
          onChange={(addresses) => setFormData({ ...formData, addresses })}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={isSubmitting} data-testid="person-form-submit">
          {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Create'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
