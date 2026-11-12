/**
 * The household's calendars: add one, rename or recolour it, delete it.
 *
 * Lives inside a modal opened from the calendar page. A calendar is two
 * fields, so adding and editing happen in a row rather than a form of their
 * own; deleting asks first, because it takes every event on the calendar.
 */

import { useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { COLOR_LABELS, colorClasses } from '../colors';
import {
  useCreateCalendar,
  useDeleteCalendar,
  useUpdateCalendar,
} from '../hooks/useCalendars';
import { CALENDAR_COLORS } from '../resources';
import type { Calendar, CalendarColor } from '../types';

interface CalendarsManagerProps {
  calendars: Calendar[];
  /** Name the add row starts with — "Family" for a household's first calendar. */
  suggestedName?: string;
}

/** The first colour no calendar uses yet, so a new one stands apart by default. */
function nextColor(calendars: Calendar[]): CalendarColor {
  const used = new Set(calendars.map((c) => c.color));
  return CALENDAR_COLORS.find((c) => !used.has(c)) ?? CALENDAR_COLORS[0];
}

export function CalendarsManager({ calendars, suggestedName = '' }: CalendarsManagerProps) {
  const createCalendar = useCreateCalendar();
  const updateCalendar = useUpdateCalendar();
  const deleteCalendar = useDeleteCalendar();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState(suggestedName);
  const [color, setColor] = useState<CalendarColor>(() => nextColor(calendars));
  const [nameError, setNameError] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Calendar | null>(null);

  const reset = (remaining: Calendar[]) => {
    setEditingId(null);
    setName('');
    setColor(nextColor(remaining));
    setNameError(undefined);
  };

  const startEdit = (calendar: Calendar) => {
    setEditingId(calendar.id);
    setName(calendar.name);
    setColor(calendar.color);
    setNameError(undefined);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Give the calendar a name.');
      return;
    }
    try {
      if (editingId) {
        await updateCalendar.mutateAsync({ id: editingId, data: { name: trimmed, color } });
        reset(calendars);
      } else {
        await createCalendar.mutateAsync({ name: trimmed, color });
        reset([...calendars, { id: '', name: trimmed, color }]);
      }
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCalendar.mutateAsync(deleteTarget.id);
      if (editingId === deleteTarget.id) reset(calendars);
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4" data-testid="calendars-manager">
      {calendars.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100">
          {calendars.map((calendar) => (
            <li
              key={calendar.id}
              className="flex items-center gap-3 px-3 py-2"
              data-testid="calendar-row"
            >
              <span
                className={`h-3 w-3 shrink-0 rounded-full ${colorClasses(calendar.color).dot}`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{calendar.name}</span>
              <button
                type="button"
                onClick={() => startEdit(calendar)}
                aria-label={`Edit ${calendar.name}`}
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                data-testid="calendar-row-edit"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(calendar)}
                aria-label={`Delete ${calendar.name}`}
                className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                data-testid="calendar-row-delete"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-3" data-testid="calendar-form">
        <h3 className="text-sm font-semibold text-gray-700">
          {editingId ? 'Edit calendar' : 'Add a calendar'}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
          <Input
            id="calendar-name"
            aria-label="Calendar name"
            placeholder="e.g. Family"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(undefined);
            }}
            error={nameError}
          />
          <select
            id="calendar-color"
            aria-label="Colour"
            value={color}
            onChange={(e) => setColor(e.target.value as CalendarColor)}
            className="h-9 w-full rounded-md border border-gray-300 bg-surface-white px-3 text-sm"
          >
            {CALENDAR_COLORS.map((value) => (
              <option key={value} value={value}>
                {COLOR_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          {editingId && (
            <Button type="button" variant="secondary" onClick={() => reset(calendars)}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={createCalendar.isPending || updateCalendar.isPending}
            data-testid="calendar-form-submit"
          >
            {editingId ? 'Save calendar' : 'Add calendar'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete calendar"
        message={
          deleteTarget ? `Delete “${deleteTarget.name}”? Every event on it goes with it.` : ''
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteCalendar.isPending}
      />
    </div>
  );
}
