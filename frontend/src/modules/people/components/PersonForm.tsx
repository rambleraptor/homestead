import { useState } from 'react';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import type {
  Person,
  PersonFormData,
  NotificationPreference,
} from '../types';
import { NOTIFICATION_PREFERENCE_OPTIONS } from '../types';
import { usePeople } from '../hooks/usePeople';

interface PersonFormProps {
  initialData?: Person;
  onSubmit: (data: PersonFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

/**
 * Convert PocketBase date format to HTML5 date input format
 * PocketBase returns: "2026-01-06 00:00:00.000Z"
 * HTML5 date input requires: "2026-01-06"
 */
function formatDateForInput(date: string | undefined): string {
  if (!date) return '';
  // Extract just the date portion (first 10 characters: YYYY-MM-DD)
  return date.substring(0, 10);
}

export function PersonForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: PersonFormProps) {
  const { data: people = [] } = usePeople();

  const [formData, setFormData] = useState<PersonFormData>({
    name: initialData?.name || '',
    address: initialData?.address
      ? {
          line1: initialData.address.line1,
          line2: initialData.address.line2,
          city: initialData.address.city,
          state: initialData.address.state,
          postal_code: initialData.address.postal_code,
          country: initialData.address.country,
          wifi_network: initialData.address.wifi_network,
          wifi_password: initialData.address.wifi_password,
        }
      : undefined,
    birthday: formatDateForInput(initialData?.birthday),
    anniversary: formatDateForInput(initialData?.anniversary),
    notification_preferences: initialData?.notification_preferences || [
      'day_of',
    ],
    partner_id: initialData?.partner?.id || '',
  });

  // Filter out the current person from partner options
  const availablePartners = people.filter(p => p.id !== initialData?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleNotificationToggle = (value: NotificationPreference) => {
    const current = formData.notification_preferences;
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFormData({ ...formData, notification_preferences: updated });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Name
        </label>
        <Input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., John Doe"
          required
        />
      </div>

      <div>
        <label
          htmlFor="partner"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Partner (Optional)
        </label>
        <select
          id="partner"
          value={formData.partner_id || ''}
          onChange={(e) =>
            setFormData({ ...formData, partner_id: e.target.value || undefined })
          }
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">No partner</option>
          {availablePartners.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        {formData.partner_id && (
          <p className="mt-1 text-xs text-gray-500">
            Address and anniversary will be shared with your partner
          </p>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg p-4 space-y-4">
        <h3 className="text-sm font-medium text-gray-700">
          Address {formData.partner_id && '(Shared)'}
        </h3>

        <div>
          <label htmlFor="address_line1" className="block text-sm text-gray-700 mb-1">
            Street Address
          </label>
          <Input
            id="address_line1"
            type="text"
            value={formData.address?.line1 || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFormData({
                ...formData,
                address: { ...formData.address, line1: e.target.value } as PersonFormData['address']
              })
            }
            placeholder="123 Main St"
          />
        </div>

        <div>
          <label htmlFor="address_line2" className="block text-sm text-gray-700 mb-1">
            Apt, Suite, etc. (Optional)
          </label>
          <Input
            id="address_line2"
            type="text"
            value={formData.address?.line2 || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFormData({
                ...formData,
                address: { ...formData.address, line2: e.target.value } as PersonFormData['address']
              })
            }
            placeholder="Apt 4B"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="address_city" className="block text-sm text-gray-700 mb-1">
              City
            </label>
            <Input
              id="address_city"
              type="text"
              value={formData.address?.city || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData({
                  ...formData,
                  address: { ...formData.address, city: e.target.value } as PersonFormData['address']
                })
              }
              placeholder="Anytown"
            />
          </div>

          <div>
            <label htmlFor="address_state" className="block text-sm text-gray-700 mb-1">
              State/Province
            </label>
            <Input
              id="address_state"
              type="text"
              value={formData.address?.state || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData({
                  ...formData,
                  address: { ...formData.address, state: e.target.value } as PersonFormData['address']
                })
              }
              placeholder="CA"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="address_postal_code" className="block text-sm text-gray-700 mb-1">
              Postal Code
            </label>
            <Input
              id="address_postal_code"
              type="text"
              value={formData.address?.postal_code || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData({
                  ...formData,
                  address: { ...formData.address, postal_code: e.target.value } as PersonFormData['address']
                })
              }
              placeholder="12345"
            />
          </div>

          <div>
            <label htmlFor="address_country" className="block text-sm text-gray-700 mb-1">
              Country
            </label>
            <Input
              id="address_country"
              type="text"
              value={formData.address?.country || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData({
                  ...formData,
                  address: { ...formData.address, country: e.target.value } as PersonFormData['address']
                })
              }
              placeholder="USA"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">WiFi Information (Optional)</h4>

          <div className="space-y-3">
            <div>
              <label htmlFor="wifi_network" className="block text-sm text-gray-700 mb-1">
                Network Name
              </label>
              <Input
                id="wifi_network"
                type="text"
                value={formData.address?.wifi_network || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address, wifi_network: e.target.value } as PersonFormData['address']
                  })
                }
                placeholder="MyHomeWiFi"
              />
            </div>

            <div>
              <label htmlFor="wifi_password" className="block text-sm text-gray-700 mb-1">
                Password
              </label>
              <Input
                id="wifi_password"
                type="text"
                value={formData.address?.wifi_password || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({
                    ...formData,
                    address: { ...formData.address, wifi_password: e.target.value } as PersonFormData['address']
                  })
                }
                placeholder="••••••••"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <label
          htmlFor="birthday"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Birthday (Optional)
        </label>
        <Input
          id="birthday"
          type="date"
          value={formData.birthday}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFormData({ ...formData, birthday: e.target.value })
          }
        />
      </div>

      <div>
        <label
          htmlFor="anniversary"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Anniversary {formData.partner_id && '(Shared)'}
        </label>
        <Input
          id="anniversary"
          type="date"
          value={formData.anniversary}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFormData({ ...formData, anniversary: e.target.value })
          }
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Notification Preferences
        </label>
        <div className="space-y-2">
          {NOTIFICATION_PREFERENCE_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id={`notification_${option.value}`}
                  type="checkbox"
                  checked={formData.notification_preferences.includes(
                    option.value
                  )}
                  onChange={() => handleNotificationToggle(option.value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label
                  htmlFor={`notification_${option.value}`}
                  className="font-medium text-gray-700"
                >
                  {option.label}
                </label>
                <p className="text-gray-500">
                  {option.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} data-testid="person-form-cancel">
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} data-testid="person-form-submit">
          {isSubmitting
            ? 'Saving...'
            : initialData
              ? 'Update Person'
              : 'Create Person'}
        </Button>
      </div>
    </form>
  );
}
