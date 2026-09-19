/**
 * Create / edit form for a notification you schedule for yourself.
 *
 * Runs through the shared `useSchemaForm` engine like every other form here.
 * The UI shape diverges from the schema in one place: `send_at` is a single
 * stored instant, entered as a required date plus an optional time (see
 * `utils/scheduleDate`), so both controls are declared as extra fields and
 * `buildPayload` recombines them.
 *
 * There is no audience control. A row addresses whoever it is parented under,
 * and the browser can only write under the signed-in user — so this form is
 * always "remind me", and says so rather than offering a choice that would 403.
 */

import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { useSchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { notificationsResources } from '../resources';
import { DEFAULT_HOUR, fromSendAt, toSendAt } from '../utils/scheduleDate';
import type {
  ScheduledNotification,
  ScheduledNotificationFormData,
} from '../types';

const scheduledDef = notificationsResources.find(
  (r) => r.singular === 'scheduled-notification',
)!;

interface ScheduleFormProps {
  initialData?: ScheduledNotification;
  onSubmit: (data: ScheduledNotificationFormData) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

/** `ScheduledNotificationFormData` plus the split send-time controls. */
type ScheduleFormValues = ScheduledNotificationFormData & {
  sendDate: string;
  sendTime: string;
};

export function ScheduleForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: ScheduleFormProps) {
  const initial = fromSendAt(initialData?.send_at);

  const form = useSchemaForm<ScheduleFormValues>({
    resource: scheduledDef,
    initialData: {
      title: initialData?.title ?? '',
      message: initialData?.message ?? '',
      sendDate: initial.date,
      sendTime: initial.time,
    },
    fields: {
      // Assembled from sendDate + sendTime in buildPayload.
      send_at: { hidden: true },
      // Owned by the dispatcher and the cancel button, never typed.
      status: { hidden: true },
      sent_at: { hidden: true },
      attempts: { hidden: true },
      last_error: { hidden: true },
      notification_id: { hidden: true },
      url: { hidden: true },
      source_app: { hidden: true },
      source_key: { hidden: true },
      source_collection: { hidden: true },
      source_id: { hidden: true },
      title: { id: 'schedule-title' },
      // Required on the wire, optional here: `buildPayload` repeats the title
      // when it's blank. Without this override the schema's `required` would
      // make the engine reject every submit with an empty Details before a
      // request is ever sent.
      message: { id: 'schedule-message', required: false },
    },
    extraFields: {
      sendDate: { type: 'string', required: true },
      sendTime: { type: 'string' },
    },
    validate: (values) => {
      const date = String(values.sendDate ?? '').trim();
      if (!date) return { sendDate: 'A date is required' };
      if (!toSendAt(date, String(values.sendTime ?? ''))) {
        return { sendDate: 'Enter a real date and time' };
      }
      return null;
    },
    buildPayload: (v) => {
      const message = String(v.message ?? '').trim();
      const payload: ScheduledNotificationFormData = {
        title: String(v.title ?? '').trim(),
        // `validate` has already rejected an unparseable pair, so the fallback
        // is unreachable — it exists so the type stays honest.
        send_at:
          toSendAt(String(v.sendDate ?? ''), String(v.sendTime ?? '')) ??
          new Date().toISOString(),
      };
      // `message` is required by the schema, so an empty one would 400. The
      // title is the thing people actually type; repeat it rather than making
      // someone write the same sentence twice.
      payload.message = message !== '' ? message : payload.title;
      return payload as unknown as Record<string, unknown>;
    },
    onSubmit,
  });

  const busy = isSubmitting || form.isSubmitting;

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="schedule-title"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Remind me to <span className="text-red-500">*</span>
        </label>
        <Input
          id="schedule-title"
          data-testid="schedule-form-title"
          type="text"
          placeholder="e.g. Call the plumber"
          value={(form.values.title as string) ?? ''}
          onChange={(e) => form.setValue('title', e.target.value)}
          error={form.errors.title}
          required
        />
      </div>

      <div>
        <label
          htmlFor="schedule-form-date"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          When <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Input
            id="schedule-form-date"
            aria-label="Date"
            data-testid="schedule-form-date"
            type="date"
            value={(form.values.sendDate as string) ?? ''}
            onChange={(e) => form.setValue('sendDate', e.target.value)}
            error={form.errors.sendDate}
            required
          />
          <Input
            aria-label="Time (optional)"
            data-testid="schedule-form-time"
            type="time"
            value={(form.values.sendTime as string) ?? ''}
            onChange={(e) => form.setValue('sendTime', e.target.value)}
          />
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {`Without a time it arrives at ${DEFAULT_HOUR}:00.`}
        </p>
      </div>

      <div>
        <label
          htmlFor="schedule-message"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Details
        </label>
        <textarea
          id="schedule-message"
          data-testid="schedule-form-message"
          rows={3}
          value={(form.values.message as string) ?? ''}
          onChange={(e) => form.setValue('message', e.target.value)}
          aria-invalid={form.errors.message ? true : undefined}
          className={`w-full rounded-md border px-3 py-2 ${
            form.errors.message ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {form.errors.message ? (
          <p className="text-sm text-red-600 mt-1" role="alert">
            {form.errors.message}
          </p>
        ) : (
          <p className="text-sm text-gray-500 mt-1">
            Shown under the title in the notification. Leave blank to repeat the title.
          </p>
        )}
      </div>

      {/* A save that fails for a reason no single field owns (the engine
          refused it, the network dropped) lands here rather than nowhere. */}
      {form.formError && (
        <p
          className="text-sm text-red-600"
          role="alert"
          data-testid="schedule-form-error"
        >
          {form.formError}
        </p>
      )}

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={busy} data-testid="schedule-form-submit">
          {busy ? 'Saving...' : initialData ? 'Update' : 'Schedule'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
