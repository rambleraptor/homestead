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
    address: initialData?.address || '',
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

      <div>
        <label
          htmlFor="address"
          className="block text-sm font-medium text-gray-700 mb-2"
        >
          Address {formData.partner_id && '(Shared)'}
        </label>
        <Input
          id="address"
          type="text"
          value={formData.address}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFormData({ ...formData, address: e.target.value })
          }
          placeholder="e.g., 123 Main St, Anytown, USA"
        />
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
