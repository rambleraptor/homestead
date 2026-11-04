/**
 * Event form. Markup, styling, and behavior are unchanged; state, validation,
 * and submission now run through the shared `useSchemaForm` engine. The event's
 * UI shape diverges from its resource schema (month/day/year are typed as
 * strings for the native controls, the tag select splits into a sentinel +
 * custom text, people are bare ids, and the "Nth weekday" rule is entered as two
 * selects), so those controls are managed as extra fields and `buildPayload`
 * reproduces the exact `EventFormData` transform (numeric coercion, `people/`
 * prefixing, `recurrence_rule` assembly, year-null-on-edit-clear).
 */

import { useSchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { PersonSelector } from '@rambleraptor/homestead-core/shared/components/PersonSelector';
import { useFavorites } from '@rambleraptor/homestead-core/shared/favorites';
import { parseNthWeekdayRule } from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { usePeople } from '../../people/hooks/usePeople';
import { KNOWN_EVENT_TAGS } from '../types';
import { eventsResources } from '../resources';
import type { Event, EventFormData, EventRecurrence } from '../types';

const eventDef = eventsResources.find((r) => r.singular === 'event')!;

interface EventFormProps {
  initialData?: Event;
  onSubmit: (data: EventFormData) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const CUSTOM_TAG_SENTINEL = '__custom__';

/**
 * The hook's value shape: `EventFormData` plus the UI-only controls that don't
 * map 1:1 to schema fields (the tag sentinel + custom text and the two "Nth
 * weekday" selects). `buildPayload` collapses these back into `EventFormData`.
 */
type EventFormValues = EventFormData & {
  tagSelection: string;
  customTag: string;
  recurrenceWeek: string;
  recurrenceWeekday: string;
};

const WEEK_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '1', label: '1st' },
  { value: '2', label: '2nd' },
  { value: '3', label: '3rd' },
  { value: '4', label: '4th' },
  { value: '-1', label: 'Last' },
];

const WEEKDAY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

const MONTH_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
].map((label, i) => ({ value: String(i + 1), label }));

function personIdFromRef(ref: string): string {
  return ref.startsWith('people/') ? ref.slice('people/'.length) : ref;
}

function knownTagOrCustom(tag: string | undefined):
  | { mode: 'known' | 'none'; value: string }
  | { mode: 'custom'; value: string } {
  if (!tag) return { mode: 'none', value: '' };
  if ((KNOWN_EVENT_TAGS as readonly string[]).includes(tag)) {
    return { mode: 'known', value: tag };
  }
  return { mode: 'custom', value: tag };
}

// Derive the "Nth weekday of month" from a month/day (and year, if known). The
// occurrence `n` comes from the day alone; the weekday needs a concrete year,
// so it's only derived when the user supplied one — otherwise they pick it.
// Maps a 5th occurrence to -1 ("Last") since the form has no 5th option and
// "last" is the more useful semantic.
function deriveNthWeekday(
  month: number,
  day: number,
  year?: number,
): { n: number; weekday: number | null } {
  const rawN = Math.ceil(day / 7);
  const n = rawN === 5 ? -1 : rawN;
  const weekday = year ? new Date(year, month - 1, day).getDay() : null;
  return { n, weekday };
}

export function EventForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: EventFormProps) {
  const { data: people = [] } = usePeople();
  const personFavorites = useFavorites('person');

  const initialPeopleIds = (initialData?.people ?? []).map(personIdFromRef);
  const initialTag = knownTagOrCustom(initialData?.tag);
  const initialRule =
    initialData?.recurrence === 'yearly-nth-weekday'
      ? parseNthWeekdayRule(initialData.recurrence_rule)
      : null;

  const form = useSchemaForm<EventFormValues>({
    resource: eventDef,
    initialData: {
      name: initialData?.name ?? '',
      month: initialData?.month ? String(initialData.month) : '',
      day: initialData?.day ? String(initialData.day) : '',
      year: initialData?.year != null ? String(initialData.year) : '',
      tagSelection:
        initialTag.mode === 'custom'
          ? CUSTOM_TAG_SENTINEL
          : initialTag.mode === 'known'
            ? initialTag.value
            : '',
      customTag: initialTag.mode === 'custom' ? initialTag.value : '',
      recurrence:
        initialData?.recurrence === 'yearly-nth-weekday' ? 'yearly-nth-weekday' : 'yearly',
      recurrenceWeek: initialRule ? String(initialRule.n) : '',
      recurrenceWeekday: initialRule ? String(initialRule.weekday) : '',
      people: initialPeopleIds,
    },
    fields: {
      name: { id: 'event-name' },
      // Managed via the split controls below / computed in buildPayload.
      tag: { hidden: true },
      recurrence_rule: { hidden: true },
    },
    // The UI-shaped controls that don't map 1:1 to schema fields. Month/day/year
    // stay strings so the native selects/inputs round-trip cleanly.
    extraFields: {
      month: { type: 'string' },
      day: { type: 'string' },
      year: { type: 'string' },
      tagSelection: { type: 'string' },
      customTag: { type: 'string' },
      recurrence: { type: 'string' },
      recurrenceWeek: { type: 'string' },
      recurrenceWeekday: { type: 'string' },
      people: { type: 'array' },
    },
    buildPayload: (v) => {
      const trimmedYear = String(v.year ?? '').trim();
      const tagSel = (v.tagSelection as string) ?? '';
      const resolvedTag =
        tagSel === CUSTOM_TAG_SENTINEL
          ? String(v.customTag ?? '').trim() || undefined
          : tagSel || undefined;
      const base: EventFormData = {
        name: String(v.name ?? '').trim(),
        month: Number(v.month),
        day: Number(v.day),
        tag: resolvedTag,
        people: (v.people as string[]).map((id) => `people/${id}`),
      };
      if (trimmedYear !== '') {
        base.year = Number(trimmedYear);
      } else if (initialData) {
        // Editing and the year was cleared — send null so merge-patch drops it.
        base.year = null;
      }
      const week = (v.recurrenceWeek as string) ?? '';
      const weekday = (v.recurrenceWeekday as string) ?? '';
      if (v.recurrence === 'yearly-nth-weekday' && week && weekday) {
        base.recurrence = 'yearly-nth-weekday';
        base.recurrence_rule = `${week}:${weekday}`;
      }
      return base as unknown as Record<string, unknown>;
    },
    onSubmit,
  });

  const busy = isSubmitting || form.isSubmitting;
  const recurrence = (form.values.recurrence as EventRecurrence) ?? 'yearly';
  const tagSelection = (form.values.tagSelection as string) ?? '';
  const selectedPeople = (form.values.people as string[]) ?? [];

  const handleTogglePerson = (personId: string) => {
    const next = selectedPeople.includes(personId)
      ? selectedPeople.filter((p) => p !== personId)
      : [...selectedPeople, personId];
    form.setValue('people', next);
  };

  const handleRecurrenceChange = (value: string) => {
    const next: EventRecurrence =
      value === 'yearly-nth-weekday' ? 'yearly-nth-weekday' : 'yearly';
    const patch: Record<string, unknown> = { recurrence: next };
    const month = (form.values.month as string) ?? '';
    const day = (form.values.day as string) ?? '';
    const year = (form.values.year as string) ?? '';
    const week = (form.values.recurrenceWeek as string) ?? '';
    const weekday = (form.values.recurrenceWeekday as string) ?? '';
    if (next === 'yearly-nth-weekday' && month && day && (!week || !weekday)) {
      const derived = deriveNthWeekday(
        Number(month),
        Number(day),
        year ? Number(year) : undefined,
      );
      if (!week) patch.recurrenceWeek = String(derived.n);
      if (!weekday && derived.weekday != null) {
        patch.recurrenceWeekday = String(derived.weekday);
      }
    }
    form.setValues(patch);
  };

  return (
    <form onSubmit={form.handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="event-name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Name <span className="text-red-500">*</span>
        </label>
        <Input
          id="event-name"
          data-testid="event-form-name"
          type="text"
          value={(form.values.name as string) ?? ''}
          onChange={(e) => form.setValue('name', e.target.value)}
          required
        />
      </div>

      <div>
        <label
          htmlFor="event-form-month"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Date <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <select
            id="event-form-month"
            aria-label="Month"
            data-testid="event-form-month"
            value={(form.values.month as string) ?? ''}
            onChange={(e) => form.setValue('month', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            required
          >
            <option value="" disabled>
              Month…
            </option>
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <Input
            aria-label="Day"
            data-testid="event-form-day"
            type="number"
            min={1}
            max={31}
            placeholder="Day"
            value={(form.values.day as string) ?? ''}
            onChange={(e) => form.setValue('day', e.target.value)}
            required
          />
        </div>
        <Input
          aria-label="Year (optional)"
          data-testid="event-form-year"
          type="number"
          placeholder="Year (optional)"
          value={(form.values.year as string) ?? ''}
          onChange={(e) => form.setValue('year', e.target.value)}
          className="mt-3"
        />
        <p className="text-sm text-text-muted mt-1">
          {recurrence === 'yearly-nth-weekday'
            ? 'Only the month is used — the day is ignored when the rule below is set.'
            : 'Events repeat yearly. The year is optional — add the birth or wedding year to show an age or anniversary count.'}
        </p>
      </div>

      <div>
        <label
          htmlFor="event-recurrence"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Repeats
        </label>
        <select
          id="event-recurrence"
          data-testid="event-form-recurrence"
          value={recurrence}
          onChange={(e) => handleRecurrenceChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        >
          <option value="yearly">On this date every year</option>
          <option value="yearly-nth-weekday">
            The Nth weekday of this month every year
          </option>
        </select>
        {recurrence === 'yearly-nth-weekday' && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <select
              aria-label="Week of month"
              data-testid="event-form-recurrence-week"
              value={(form.values.recurrenceWeek as string) ?? ''}
              onChange={(e) => form.setValue('recurrenceWeek', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
            >
              <option value="" disabled>
                Week…
              </option>
              {WEEK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Weekday"
              data-testid="event-form-recurrence-weekday"
              value={(form.values.recurrenceWeekday as string) ?? ''}
              onChange={(e) => form.setValue('recurrenceWeekday', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
              required
            >
              <option value="" disabled>
                Weekday…
              </option>
              {WEEKDAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label
          htmlFor="event-tag"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Tag
        </label>
        <select
          id="event-tag"
          data-testid="event-form-tag"
          value={tagSelection}
          onChange={(e) => form.setValue('tagSelection', e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2"
        >
          <option value="">No tag</option>
          {KNOWN_EVENT_TAGS.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
          <option value={CUSTOM_TAG_SENTINEL}>Custom…</option>
        </select>
        {tagSelection === CUSTOM_TAG_SENTINEL && (
          <Input
            id="event-tag-custom"
            data-testid="event-form-tag-custom"
            type="text"
            value={(form.values.customTag as string) ?? ''}
            onChange={(e) => form.setValue('customTag', e.target.value)}
            placeholder="e.g. graduation"
            className="mt-2"
          />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          People
        </label>
        <PersonSelector
          people={people.map((p) => ({ id: p.id, name: p.name }))}
          variant="chips"
          isSelected={(id) => selectedPeople.includes(id)}
          onToggle={handleTogglePerson}
          containerTestId="event-form-people"
          itemTestId={(id) => `event-form-person-${id}`}
          favoriteIds={personFavorites.favoriteIds}
          emptyMessage="Add people in the People app first to tag them on events."
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          type="submit"
          disabled={busy}
          data-testid="event-form-submit"
        >
          {busy ? 'Saving...' : initialData ? 'Update' : 'Create'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
