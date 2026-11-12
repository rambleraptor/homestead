/**
 * The calendar page: a month, a week, or an agenda of the household's events,
 * coloured by the calendar each sits on.
 *
 * Holds only what the page is looking at (which view, which days, which
 * calendars are hidden, which dialog is open). The events themselves come
 * whole from `useCalendarEvents` and are expanded here into the occurrences
 * for just the days on screen, so moving between months is instant and a
 * repeating event costs one record however long it runs.
 */

import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { ReminderOptInToggle } from '@rambleraptor/homestead-core/user-settings';
import { colorClasses } from '../colors';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useCalendars } from '../hooks/useCalendars';
import { useEventActions } from '../hooks/useEventActions';
import { useYearlyDates } from '../hooks/useYearlyDates';
import { EVENT_REMINDER_SETTING } from '../reminderSetting';
import type { Occurrence } from '../types';
import {
  addDays,
  addMonths,
  monthGridDays,
  parseDay,
  todayDay,
  weekDays,
} from '../utils/dates';
import { draftForNew, draftFromEvent, type EventFields } from '../utils/draft';
import { expandEvents } from '../utils/occurrences';
import { CalendarsManager } from './CalendarsManager';
import { DayListView } from './DayListView';
import { EventDetails } from './EventDetails';
import { EventForm } from './EventForm';
import { MonthView } from './MonthView';

type View = 'month' | 'week' | 'agenda';

const VIEWS: ReadonlyArray<{ id: View; label: string }> = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'agenda', label: 'Agenda' },
];

/** How many days the agenda looks ahead. */
const AGENDA_DAYS = 30;

/** "This one" or "all of them" — only different for a repeating event. */
type Scope = 'one' | 'all';

type Dialog =
  | { kind: 'new'; day: string }
  | { kind: 'details'; occurrence: Occurrence }
  | { kind: 'edit'; occurrence: Occurrence; scope: Scope }
  | { kind: 'calendars' }
  | null;

function daysFor(view: View, anchor: string): string[] {
  if (view === 'month') return monthGridDays(anchor);
  if (view === 'week') return weekDays(anchor);
  return Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(anchor, i));
}

function step(view: View, anchor: string, direction: 1 | -1): string {
  if (view === 'month') return addMonths(anchor, direction);
  return addDays(anchor, direction * (view === 'week' ? 7 : AGENDA_DAYS));
}

function rangeLabel(view: View, anchor: string, days: string[]): string {
  if (view === 'month') {
    return parseDay(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  const short = (day: string) =>
    parseDay(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const last = days[days.length - 1]!;
  return `${short(days[0]!)} – ${short(last)}, ${parseDay(last).getFullYear()}`;
}

export function CalendarHome() {
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(() => todayDay());
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ occurrence: Occurrence; scope: Scope } | null>(
    null,
  );

  const calendarsQuery = useCalendars();
  const eventsQuery = useCalendarEvents();
  const actions = useEventActions();

  const calendars = useMemo(() => calendarsQuery.data ?? [], [calendarsQuery.data]);
  const today = todayDay();
  const days = useMemo(() => daysFor(view, anchor), [view, anchor]);

  const occurrences = useMemo(() => {
    const known = new Set(calendars.map((c) => c.id));
    const visible = (eventsQuery.data ?? []).filter(
      (e) => known.has(e.calendar) && !hidden.has(e.calendar),
    );
    return expandEvents(visible, days[0]!, days[days.length - 1]!);
  }, [calendars, eventsQuery.data, hidden, days]);

  const yearlyDates = useYearlyDates(days[0]!, days[days.length - 1]!);

  const colorOf = (calendarId: string) => calendars.find((c) => c.id === calendarId)?.color;
  const close = () => setDialog(null);

  const toggleCalendar = (id: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreate = async (calendar: string, fields: EventFields) => {
    try {
      await actions.createEvent(calendar, fields);
      close();
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleEdit = async (occurrence: Occurrence, scope: Scope, fields: EventFields) => {
    try {
      if (occurrence.recurring && scope === 'one') {
        await actions.updateOccurrence(occurrence, fields);
      } else {
        await actions.updateEvent(occurrence.event, fields);
      }
      close();
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const { occurrence, scope } = deleteTarget;
    try {
      if (occurrence.recurring && scope === 'all') await actions.deleteSeries(occurrence.event);
      else await actions.deleteOccurrence(occurrence);
      close();
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
    setDeleteTarget(null);
  };

  const defaultCalendar = (calendars.find((c) => !hidden.has(c.id)) ?? calendars[0])?.id ?? '';
  const isLoading = calendarsQuery.isLoading || eventsQuery.isLoading;
  const loadError = calendarsQuery.error ?? eventsQuery.error;
  const hasCalendars = calendars.length > 0;

  return (
    <div className="space-y-4" data-testid="calendar-home">
      <PageHeader
        title="Calendar"
        subtitle="What the household has on, and when"
        actions={
          hasCalendars && (
            <div className="flex flex-wrap items-center gap-2">
              <ReminderOptInToggle
                appId="calendar"
                settingKey={EVENT_REMINDER_SETTING}
                offLabel="Remind me"
                onLabel="Reminding me"
                offTitle="Get a reminder 30 minutes before each event, and on the morning of all-day ones"
                onTitle="You get a reminder 30 minutes before each event, and on the morning of all-day ones"
                data-testid="calendar-reminder-toggle"
              />
              <Button
                variant="secondary"
                onClick={() => setDialog({ kind: 'calendars' })}
                data-testid="calendar-manage"
              >
                <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Calendars
              </Button>
              <Button
                onClick={() => setDialog({ kind: 'new', day: view === 'month' ? today : anchor })}
                data-testid="calendar-new-event"
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                New event
              </Button>
            </div>
          )
        }
      />

      {isLoading && <SkeletonList rows={4} label="Loading calendar" data-testid="calendar-loading" />}

      {loadError && (
        <QueryError
          error={loadError}
          onRetry={() => {
            void calendarsQuery.refetch();
            void eventsQuery.refetch();
          }}
          title="Couldn’t load the calendar"
          data-testid="calendar-error"
        />
      )}

      {!isLoading && !loadError && !hasCalendars && (
        <EmptyState
          icon={CalendarDays}
          title="No calendars yet"
          description="A calendar is a named, coloured set of events — one for the whole family, one per person, one for school. Start with one and add more whenever you like."
          action={{
            label: 'Create a calendar',
            onClick: () => setDialog({ kind: 'calendars' }),
            testId: 'calendar-empty-create',
          }}
          data-testid="calendar-empty"
        />
      )}

      {!isLoading && !loadError && hasCalendars && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAnchor(step(view, anchor, -1))}
                aria-label="Previous"
                className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
                data-testid="calendar-prev"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setAnchor(today)}
                className="rounded-md border border-gray-300 bg-surface-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                data-testid="calendar-today"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setAnchor(step(view, anchor, 1))}
                aria-label="Next"
                className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
                data-testid="calendar-next"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
              <h2
                className="ml-2 text-lg font-semibold text-brand-navy"
                data-testid="calendar-range-label"
              >
                {rangeLabel(view, anchor, days)}
              </h2>
            </div>
            <div className="inline-flex rounded-md border border-gray-300 bg-surface-white p-0.5">
              {VIEWS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  aria-pressed={view === id}
                  className={`rounded px-3 py-1 text-sm font-medium ${
                    view === id ? 'bg-brand-navy text-white' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                  data-testid={`calendar-view-${id}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2" data-testid="calendar-legend">
            {calendars.map((calendar) => {
              const shown = !hidden.has(calendar.id);
              return (
                <button
                  key={calendar.id}
                  type="button"
                  onClick={() => toggleCalendar(calendar.id)}
                  aria-pressed={shown}
                  title={shown ? `Hide ${calendar.name}` : `Show ${calendar.name}`}
                  className={`inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-surface-white px-2.5 py-1 text-xs font-medium ${
                    shown ? 'text-gray-800' : 'text-gray-400 line-through'
                  }`}
                  data-testid="calendar-legend-item"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${shown ? colorClasses(calendar.color).dot : 'bg-gray-300'}`}
                    aria-hidden="true"
                  />
                  {calendar.name}
                </button>
              );
            })}
          </div>

          {view === 'month' ? (
            <MonthView
              days={days}
              anchor={anchor}
              today={today}
              occurrences={occurrences}
              yearlyDates={yearlyDates}
              colorOf={colorOf}
              onSelect={(occurrence) => setDialog({ kind: 'details', occurrence })}
              onAdd={(day) => setDialog({ kind: 'new', day })}
              onShowDay={(day) => {
                setAnchor(day);
                setView('week');
              }}
            />
          ) : (
            <DayListView
              days={days}
              today={today}
              occurrences={occurrences}
              yearlyDates={yearlyDates}
              layout={view}
              colorOf={colorOf}
              onSelect={(occurrence) => setDialog({ kind: 'details', occurrence })}
              onAdd={(day) => setDialog({ kind: 'new', day })}
            />
          )}
        </>
      )}

      <Modal isOpen={dialog?.kind === 'calendars'} onClose={close} title="Calendars">
        <CalendarsManager calendars={calendars} suggestedName={hasCalendars ? '' : 'Family'} />
      </Modal>

      <Modal isOpen={dialog?.kind === 'new'} onClose={close} title="New event">
        {dialog?.kind === 'new' && (
          <EventForm
            calendars={calendars}
            initialDraft={draftForNew(dialog.day, defaultCalendar)}
            submitLabel="Add event"
            isSubmitting={actions.isSaving}
            onSubmit={handleCreate}
            onCancel={close}
          />
        )}
      </Modal>

      <Modal
        isOpen={dialog?.kind === 'details'}
        onClose={close}
        title={dialog?.kind === 'details' ? dialog.occurrence.event.title : ''}
      >
        {dialog?.kind === 'details' && (
          <EventDetails
            occurrence={dialog.occurrence}
            calendar={calendars.find((c) => c.id === dialog.occurrence.event.calendar)}
            onEdit={() => setDialog({ kind: 'edit', occurrence: dialog.occurrence, scope: 'one' })}
            onEditSeries={() =>
              setDialog({ kind: 'edit', occurrence: dialog.occurrence, scope: 'all' })
            }
            onDelete={() => setDeleteTarget({ occurrence: dialog.occurrence, scope: 'one' })}
            onDeleteSeries={() => setDeleteTarget({ occurrence: dialog.occurrence, scope: 'all' })}
          />
        )}
      </Modal>

      <Modal
        isOpen={dialog?.kind === 'edit'}
        onClose={close}
        title={
          dialog?.kind === 'edit' && dialog.occurrence.recurring
            ? dialog.scope === 'one'
              ? 'Edit this event'
              : 'Edit all events'
            : 'Edit event'
        }
      >
        {dialog?.kind === 'edit' &&
          (() => {
            const { occurrence, scope } = dialog;
            const single = occurrence.recurring && scope === 'one';
            return (
              <EventForm
                calendars={calendars}
                initialDraft={draftFromEvent(occurrence.event, single ? occurrence : undefined)}
                timezone={occurrence.event.timezone}
                existingRrule={occurrence.event.rrule}
                lockCalendar
                hideRepeat={single || Boolean(occurrence.event.series)}
                submitLabel="Save event"
                isSubmitting={actions.isSaving}
                onSubmit={(_calendar, fields) => handleEdit(occurrence, scope, fields)}
                onCancel={close}
              />
            );
          })()}
      </Modal>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={
          deleteTarget?.occurrence.recurring && deleteTarget.scope === 'all'
            ? 'Delete all events'
            : 'Delete event'
        }
        message={
          deleteTarget
            ? deleteTarget.occurrence.recurring && deleteTarget.scope === 'all'
              ? `Delete “${deleteTarget.occurrence.event.title}” and every time it repeats?`
              : deleteTarget.occurrence.recurring
                ? `Delete just this “${deleteTarget.occurrence.event.title}”? The rest of the series stays.`
                : `Delete “${deleteTarget.occurrence.event.title}”?`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={actions.isDeleting}
      />
    </div>
  );
}
