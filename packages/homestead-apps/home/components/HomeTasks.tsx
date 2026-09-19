/**
 * Home upkeep: the recurring things the house needs and when they're next due.
 *
 * The schedule is household data — anyone can add "clean the gutters" or fix
 * the furnace filter size — but being *told* about it is a per-person opt-in
 * (`task_reminder`), offered right here rather than buried in Settings. The
 * cron under `crons/task-reminders` turns whatever is on this list into queued
 * notifications for whoever opted in; nothing on this page sends anything.
 *
 * Renders as a *section* — `HomePage` owns the page title, so this contributes
 * only its own heading and rows.
 */

import { useState } from 'react';
import { AlertCircle, Plus, Wrench } from 'lucide-react';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { ReminderOptInToggle } from '@rambleraptor/homestead-core/user-settings';
import {
  useCompleteHomeTask,
  useCreateHomeTask,
  useDeleteHomeTask,
  useHomeTasks,
  useUpdateHomeTask,
} from '../hooks/useHomeTasks';
import { TASK_REMINDER_SETTING } from '../taskReminderSetting';
import type { HomeTask, HomeTaskFormData } from '../types';
import { HomeTaskForm } from './HomeTaskForm';
import { HomeTaskRow } from './HomeTaskRow';

export function HomeTasks() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HomeTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeTask | null>(null);

  const { data: tasks, isLoading, isError, error } = useHomeTasks();
  const createTask = useCreateHomeTask();
  const updateTask = useUpdateHomeTask();
  const deleteTask = useDeleteHomeTask();
  const { complete, isPending: completing } = useCompleteHomeTask();

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (task: HomeTask) => {
    setEditing(task);
    setFormOpen(true);
  };

  const handleSubmit = async (data: HomeTaskFormData) => {
    try {
      if (editing) {
        // Merge-patch: null clears notes the user emptied out.
        await updateTask.mutateAsync({
          id: editing.id,
          data: { ...data, notes: data.notes || null },
        });
      } else {
        await createTask.mutateAsync({
          ...data,
          ...(data.notes ? { notes: data.notes } : { notes: undefined }),
        });
      }
      closeForm();
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleComplete = async (task: HomeTask) => {
    try {
      await complete(task);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleTogglePause = async (task: HomeTask) => {
    try {
      await updateTask.mutateAsync({ id: task.id, data: { paused: !task.paused } });
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTask.mutateAsync(deleteTarget.id);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
    setDeleteTarget(null);
  };

  return (
    <section data-testid="home-tasks">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Upkeep
        </h2>
        <div className="flex items-center gap-2">
          <ReminderOptInToggle
            appId="home"
            settingKey={TASK_REMINDER_SETTING}
            offLabel="Remind me"
            onLabel="Reminding me"
            offTitle="Get a reminder the morning each task comes due"
            onTitle="You get a reminder the morning each task comes due"
            data-testid="home-task-reminder-toggle"
          />
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            data-testid="home-task-add"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add reminder
          </button>
        </div>
      </div>

      {isLoading && (
        <SkeletonList rows={3} label="Loading upkeep" data-testid="home-tasks-loading" />
      )}

      {isError && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error instanceof Error ? error.message : 'Failed to load upkeep tasks'}
        </div>
      )}

      {tasks && tasks.length === 0 && (
        <p
          className="rounded-2xl border border-gray-100 bg-surface-white px-4 py-8 text-center text-sm text-gray-500"
          data-testid="home-tasks-empty"
        >
          Nothing scheduled yet. Add the things the house needs on a cycle —
          gutters cleaned, furnace filter replaced, water heater flushed — and
          keep the details you always forget (filter size, who you called last
          time) in the notes.
        </p>
      )}

      {tasks && tasks.length > 0 && (
        <ul
          className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-surface-white"
          data-testid="home-tasks-list"
        >
          {tasks.map((task) => (
            <HomeTaskRow
              key={task.id}
              task={task}
              onComplete={handleComplete}
              onEdit={openEdit}
              onTogglePause={handleTogglePause}
              onDelete={setDeleteTarget}
              busy={completing || updateTask.isPending}
            />
          ))}
        </ul>
      )}

      {tasks && tasks.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
          <Wrench className="h-3 w-3" aria-hidden="true" />
          Marking one done rolls it forward to the next time it's due
        </p>
      )}

      <Modal
        isOpen={formOpen}
        onClose={closeForm}
        title={editing ? 'Edit reminder' : 'New home reminder'}
      >
        <HomeTaskForm
          initialData={editing ?? undefined}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          isSubmitting={createTask.isPending || updateTask.isPending}
        />
      </Modal>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete reminder"
        message={
          deleteTarget
            ? `Delete “${deleteTarget.name}”? Its schedule and notes go with it.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteTask.isPending}
      />
    </section>
  );
}
