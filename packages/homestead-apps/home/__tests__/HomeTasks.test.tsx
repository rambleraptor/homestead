/**
 * The Upkeep section: the list, the states around it, and the two row actions
 * that aren't plain CRUD — "Done" (which rolls the schedule forward rather than
 * ticking a box) and "Pause". The hooks are mocked so the test drives the list
 * directly and asserts what the section does with what it's given.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { HomeTask } from '../types';

const useHomeTasks = vi.fn();
const complete = vi.fn();
const updateAsync = vi.fn();
const deleteAsync = vi.fn();

vi.mock('../hooks/useHomeTasks', () => ({
  useHomeTasks: () => useHomeTasks(),
  useCreateHomeTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateHomeTask: () => ({ mutateAsync: updateAsync, isPending: false }),
  useDeleteHomeTask: () => ({ mutateAsync: deleteAsync, isPending: false }),
  useCompleteHomeTask: () => ({ complete, isPending: false }),
}));

vi.mock('@rambleraptor/homestead-core/user-settings', () => ({
  ReminderOptInToggle: (props: { 'data-testid'?: string }) => (
    <button type="button" data-testid={props['data-testid']} />
  ),
}));

const celebrate = vi.fn();
vi.mock('@rambleraptor/homestead-core/shared/components/ToastProvider', () => ({
  useToast: () => ({ celebrate }),
}));

import { HomeTasks } from '../components/HomeTasks';

const task = (over: Partial<HomeTask> = {}): HomeTask => ({
  id: 't1',
  name: 'Replace furnace filter',
  notes: '20x25x1, MERV 11',
  interval_count: 3,
  interval_unit: 'month',
  next_due: '2099-01-01',
  ...over,
});

function setup(data: HomeTask[] | undefined, extra: Record<string, unknown> = {}) {
  useHomeTasks.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    ...extra,
  });
  // The empty state's "Ask the assistant" link needs a router.
  render(
    <MemoryRouter>
      <HomeTasks />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useHomeTasks.mockReset();
  celebrate.mockReset();
  complete.mockReset().mockResolvedValue(undefined);
  updateAsync.mockReset().mockResolvedValue(undefined);
  deleteAsync.mockReset().mockResolvedValue(undefined);
});

describe('HomeTasks', () => {
  it('lists each task with its cadence and its notes', () => {
    setup([task()]);

    const row = screen.getByTestId('home-task-row');
    expect(within(row).getByText('Replace furnace filter')).toBeInTheDocument();
    expect(within(row).getByTestId('home-task-schedule')).toHaveTextContent(
      'Every 3 months',
    );
    // The notes are the reason the reminder is useful — they render inline
    // rather than behind an edit form.
    expect(within(row).getByTestId('home-task-notes')).toHaveTextContent(
      '20x25x1, MERV 11',
    );
  });

  it('flags an overdue task', () => {
    setup([task({ next_due: '2020-01-01' })]);
    expect(screen.getByTestId('home-task-urgency')).toHaveTextContent(/overdue/i);
  });

  it('marks a paused task rather than hiding it', () => {
    setup([task({ paused: true })]);
    expect(screen.getByTestId('home-task-urgency')).toHaveTextContent('Paused');
  });

  it('shows the empty state with nothing scheduled', () => {
    setup([]);
    expect(screen.getByTestId('home-tasks-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('home-tasks-list')).not.toBeInTheDocument();
  });

  it('surfaces a load failure', () => {
    setup(undefined, { isError: true, error: new Error('nope') });
    expect(screen.getByText('nope')).toBeInTheDocument();
  });

  it('rolls the schedule forward when a task is marked done', async () => {
    const user = userEvent.setup();
    const row = task();
    setup([row]);

    await user.click(screen.getByTestId('home-task-done'));

    expect(complete).toHaveBeenCalledWith(row);
  });

  describe('clearing the last overdue task', () => {
    const overdue = (over: Partial<HomeTask> = {}) =>
      task({ id: 'late', name: 'Clean gutters', next_due: '2020-01-01', ...over });

    it('celebrates once the write has landed', async () => {
      const user = userEvent.setup();
      setup([overdue(), task()]);

      const rows = screen.getAllByTestId('home-task-row');
      await user.click(within(rows[0]).getByTestId('home-task-done'));

      expect(celebrate).toHaveBeenCalledTimes(1);
      expect(celebrate).toHaveBeenCalledWith('All caught up!', {
        description: 'Nothing overdue around the house',
      });
    });

    it('says nothing while another task is still overdue', async () => {
      const user = userEvent.setup();
      setup([overdue(), overdue({ id: 'later', name: 'Flush water heater' })]);

      const rows = screen.getAllByTestId('home-task-row');
      await user.click(within(rows[0]).getByTestId('home-task-done'));

      expect(complete).toHaveBeenCalled();
      expect(celebrate).not.toHaveBeenCalled();
    });

    it('says nothing when nothing was overdue to begin with', async () => {
      const user = userEvent.setup();
      setup([task()]);

      await user.click(screen.getByTestId('home-task-done'));

      expect(celebrate).not.toHaveBeenCalled();
    });

    it('says nothing when the write fails', async () => {
      const user = userEvent.setup();
      complete.mockRejectedValueOnce(new Error('offline'));
      setup([overdue()]);

      await user.click(screen.getByTestId('home-task-done'));

      expect(celebrate).not.toHaveBeenCalled();
    });
  });

  it('toggles pause without touching anything else on the row', async () => {
    const user = userEvent.setup();
    setup([task({ paused: true })]);

    await user.click(screen.getByTestId('home-task-pause'));

    expect(updateAsync).toHaveBeenCalledWith({ id: 't1', data: { paused: false } });
  });

  it('confirms before deleting', async () => {
    const user = userEvent.setup();
    setup([task()]);

    await user.click(screen.getByTestId('home-task-delete'));
    expect(deleteAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(deleteAsync).toHaveBeenCalledWith('t1');
  });

  it('opens the form to add a reminder', async () => {
    const user = userEvent.setup();
    setup([]);

    await user.click(screen.getByTestId('home-task-add'));

    expect(screen.getByTestId('home-task-form')).toBeInTheDocument();
  });
});
