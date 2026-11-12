/**
 * Create / edit form for an event.
 *
 * Works on an `EventDraft` — the typed shape (a day, a time, "every week") —
 * and hands back the stored fields. Not built on `SchemaForm`: the controls
 * don't map onto the schema's fields one to one (`start` is a date *and* a
 * time, `rrule` is a choice plus an end date), so the form validates its own
 * draft and shows each message beside the control it's about.
 */

import { useState, type FormEvent } from 'react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import type { Calendar } from '../types';
import { localTimeZone } from '../utils/dates';
import {
  draftToFields,
  validateDraft,
  type DraftErrors,
  type EventDraft,
  type EventFields,
} from '../utils/draft';
import { REPEAT_LABELS, type RepeatPreset } from '../utils/recurrence';

const SELECT_CLASS = 'w-full rounded-md border border-gray-300 bg-surface-white px-3 py-2 text-sm';
const LABEL_CLASS = 'mb-1 block text-sm font-medium text-gray-700';

interface EventFormProps {
  calendars: Calendar[];
  initialDraft: EventDraft;
  /** The event's zone when editing; a new event takes the viewer's. */
  timezone?: string;
  /** The stored rule, kept as it is when the form can't edit it (`custom`). */
  existingRrule?: string;
  /** An existing event can't move to another calendar — its calendar is part of its address. */
  lockCalendar?: boolean;
  /** Editing one occurrence of a series: it can't itself repeat. */
  hideRepeat?: boolean;
  submitLabel: string;
  isSubmitting?: boolean;
  onSubmit: (calendar: string, fields: EventFields) => void | Promise<void>;
  onCancel: () => void;
}

export function EventForm({
  calendars,
  initialDraft,
  timezone,
  existingRrule,
  lockCalendar = false,
  hideRepeat = false,
  submitLabel,
  isSubmitting = false,
  onSubmit,
  onCancel,
}: EventFormProps) {
  const [draft, setDraft] = useState<EventDraft>(initialDraft);
  const [errors, setErrors] = useState<DraftErrors>({});

  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  /** Moving the start drags the end along, so a new event keeps its length. */
  const setStartDay = (value: string) => {
    setDraft((current) => ({
      ...current,
      startDay: value,
      endDay: current.endDay < value || current.endDay === current.startDay ? value : current.endDay,
    }));
    setErrors((current) => ({ ...current, startDay: undefined, endDay: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    await onSubmit(draft.calendar, draftToFields(draft, timezone ?? localTimeZone(), existingRrule));
  };

  const repeats = draft.repeat !== 'none';

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4" data-testid="calendar-event-form">
      <Input
        id="calendar-event-title"
        label="Title"
        value={draft.title}
        onChange={(e) => set('title', e.target.value)}
        error={errors.title}
        placeholder="e.g. Soccer practice"
        autoFocus
      />

      <div>
        <label htmlFor="calendar-event-calendar" className={LABEL_CLASS}>
          Calendar
        </label>
        <select
          id="calendar-event-calendar"
          value={draft.calendar}
          onChange={(e) => set('calendar', e.target.value)}
          disabled={lockCalendar}
          className={SELECT_CLASS}
        >
          {calendars.map((calendar) => (
            <option key={calendar.id} value={calendar.id}>
              {calendar.name}
            </option>
          ))}
        </select>
        {errors.calendar && <p className="mt-1 text-sm text-red-600">{errors.calendar}</p>}
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          id="calendar-event-all-day"
          type="checkbox"
          checked={draft.allDay}
          onChange={(e) => set('allDay', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        All day
      </label>

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="calendar-event-start-day"
          label="Starts"
          type="date"
          value={draft.startDay}
          onChange={(e) => setStartDay(e.target.value)}
          error={errors.startDay}
        />
        {!draft.allDay && (
          <Input
            id="calendar-event-start-time"
            label="At"
            type="time"
            value={draft.startTime}
            onChange={(e) => set('startTime', e.target.value)}
            error={errors.startTime}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          id="calendar-event-end-day"
          label="Ends"
          type="date"
          value={draft.endDay}
          onChange={(e) => set('endDay', e.target.value)}
          error={errors.endDay}
        />
        {!draft.allDay && (
          <Input
            id="calendar-event-end-time"
            label="At"
            type="time"
            value={draft.endTime}
            onChange={(e) => set('endTime', e.target.value)}
            error={errors.endTime}
          />
        )}
      </div>

      {!hideRepeat && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="calendar-event-repeat" className={LABEL_CLASS}>
              Repeats
            </label>
            <select
              id="calendar-event-repeat"
              value={draft.repeat}
              onChange={(e) => set('repeat', e.target.value as RepeatPreset)}
              className={SELECT_CLASS}
            >
              {Object.entries(REPEAT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {initialDraft.repeat === 'custom' && <option value="custom">Custom schedule</option>}
            </select>
          </div>
          {repeats && draft.repeat !== 'custom' && (
            <Input
              id="calendar-event-until"
              label="Until (optional)"
              type="date"
              value={draft.untilDay}
              onChange={(e) => set('untilDay', e.target.value)}
              error={errors.untilDay}
            />
          )}
        </div>
      )}

      <Input
        id="calendar-event-location"
        label="Location"
        value={draft.location}
        onChange={(e) => set('location', e.target.value)}
      />

      <div>
        <label htmlFor="calendar-event-notes" className={LABEL_CLASS}>
          Notes
        </label>
        <textarea
          id="calendar-event-notes"
          value={draft.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          className={SELECT_CLASS}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          data-testid="calendar-event-form-cancel"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} data-testid="calendar-event-form-submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
