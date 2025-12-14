import { useState } from 'react';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import type {
  Event,
  EventFormData,
  EventType,
  NotificationPreference,
} from '../types';
import { NOTIFICATION_PREFERENCE_OPTIONS } from '../types';

interface EventFormProps {
  initialData?: Event;
  onSubmit: (data: EventFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function EventForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: EventFormProps) {
  const [formData, setFormData] = useState<EventFormData>({
    event_type: initialData?.event_type || 'birthday',
    title: initialData?.title || '',
    people_involved: initialData?.people_involved || '',
    event_date: initialData?.event_date || '',
    recurring_yearly: initialData?.recurring_yearly ?? true,
    details: initialData?.details || '',
    notification_preferences: initialData?.notification_preferences || [
      'day_of',
    ],
  });

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
          htmlFor="event_type"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Event Type
        </label>
        <select
          id="event_type"
          value={formData.event_type}
          onChange={(e) =>
            setFormData({
              ...formData,
              event_type: e.target.value as EventType,
            })
          }
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          required
        >
          <option value="birthday">Birthday</option>
          <option value="anniversary">Anniversary</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="title"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Title
        </label>
        <Input
          id="title"
          type="text"
          value={formData.title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, title: e.target.value })}
          placeholder="e.g., John's Birthday"
          required
        />
      </div>

      <div>
        <label
          htmlFor="people_involved"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          People Involved
        </label>
        <Input
          id="people_involved"
          type="text"
          value={formData.people_involved}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFormData({ ...formData, people_involved: e.target.value })
          }
          placeholder="e.g., John Doe, Jane Smith"
          required
        />
      </div>

      <div>
        <label
          htmlFor="event_date"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Date
        </label>
        <Input
          id="event_date"
          type="date"
          value={formData.event_date}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setFormData({ ...formData, event_date: e.target.value })
          }
          required
        />
      </div>

      <div className="flex items-center">
        <input
          id="recurring_yearly"
          type="checkbox"
          checked={formData.recurring_yearly}
          onChange={(e) =>
            setFormData({ ...formData, recurring_yearly: e.target.checked })
          }
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label
          htmlFor="recurring_yearly"
          className="ml-2 block text-sm text-gray-700 dark:text-gray-300"
        >
          Recurring yearly
        </label>
      </div>

      <div>
        <label
          htmlFor="details"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
        >
          Additional Details (Optional)
        </label>
        <textarea
          id="details"
          value={formData.details}
          onChange={(e) =>
            setFormData({ ...formData, details: e.target.value })
          }
          placeholder="Any additional notes or details..."
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  className="font-medium text-gray-700 dark:text-gray-300"
                >
                  {option.label}
                </label>
                <p className="text-gray-500 dark:text-gray-400">
                  {option.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving...'
            : initialData
              ? 'Update Event'
              : 'Create Event'}
        </Button>
      </div>
    </form>
  );
}
