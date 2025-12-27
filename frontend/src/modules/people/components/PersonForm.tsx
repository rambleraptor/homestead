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
    address: initialData?.address?.line1 || '',
    wifi_network: initialData?.address?.wifi_network || '',
    wifi_password: initialData?.address?.wifi_password || '',
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

      <div>
        <label
          htmlFor="birthday"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Birthday
        </label>
        <Input
          id="birthday"
          type="date"
          value={formData.birthday || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFormData({ ...formData, birthday: e.target.value })
          }
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
          Partners share an address and anniversary
        </p>
      </div>

      {/* Shared fields - shown with indication if partner is selected */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="text-sm font-medium text-gray-700">
          Address {formData.partner_id && '(Shared)'}
        </h3>

        <div>
          <label htmlFor="address" className="block text-sm text-gray-700 mb-1">
            Full Address
          </label>
          <Input
            id="address"
            type="text"
            value={formData.address || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFormData({ ...formData, address: e.target.value })
            }
            placeholder="123 Main St, City, State 12345"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="wifi_network" className="block text-sm text-gray-700 mb-1">
              WiFi Network
            </label>
            <Input
              id="wifi_network"
              type="text"
              value={formData.wifi_network || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData({ ...formData, wifi_network: e.target.value })
              }
              placeholder="Network name"
            />
          </div>

          <div>
            <label htmlFor="wifi_password" className="block text-sm text-gray-700 mb-1">
              WiFi Password
            </label>
            <Input
              id="wifi_password"
              type="text"
              value={formData.wifi_password || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData({ ...formData, wifi_password: e.target.value })
              }
              placeholder="Password"
            />
          </div>
        </div>
      </div>

      {/* Shared Anniversary */}
      <div>
        <label
          htmlFor="anniversary"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Anniversary {formData.partner_id && '(Shared)'}
        </label>
        <Input
          id="anniversary"
          type="date"
          value={formData.anniversary || ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFormData({ ...formData, anniversary: e.target.value })
          }
        />
      </div>

      {/* Notification Preferences */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Notification Preferences
        </label>
        <div className="space-y-2">
          {NOTIFICATION_PREFERENCE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-start gap-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={formData.notification_preferences.includes(
                  option.value
                )}
                onChange={() => handleNotificationToggle(option.value)}
                className="mt-1"
              />
              <div>
                <span className="font-medium">{option.label}</span>
                <p className="text-sm text-gray-500">{option.description}</p>
              </div>
            </label>
          ))}
        </div>
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
