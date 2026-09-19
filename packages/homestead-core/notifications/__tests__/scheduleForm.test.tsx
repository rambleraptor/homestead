/**
 * Tests for the "Remind me" form.
 *
 * The form promises that Details is optional ("Leave blank to repeat the
 * title"), while the schema marks `message` required. The engine behind the
 * form validates against the schema, so unless the form overrides that flag,
 * a blank Details silently blocks every submit — no request, no toast, no
 * inline error, because the textarea never rendered one. These pin the
 * promise the copy makes, and that a rejected submit is always visible.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ScheduleForm } from '../components/ScheduleForm';

function fill(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

describe('ScheduleForm', () => {
  test('submits with a blank Details, repeating the title as the message', async () => {
    const onSubmit = vi.fn();
    render(<ScheduleForm onSubmit={onSubmit} onCancel={() => {}} />);

    fill('schedule-form-title', 'Call the plumber');
    fill('schedule-form-date', '2030-06-15');
    fireEvent.click(screen.getByTestId('schedule-form-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.title).toBe('Call the plumber');
    expect(payload.message).toBe('Call the plumber');
    expect(payload.send_at).toBe(new Date(2030, 5, 15, 9, 0, 0, 0).toISOString());
  });

  test('keeps typed Details as the message', async () => {
    const onSubmit = vi.fn();
    render(<ScheduleForm onSubmit={onSubmit} onCancel={() => {}} />);

    fill('schedule-form-title', 'Bins');
    fill('schedule-form-message', 'Recycling too');
    fill('schedule-form-date', '2030-06-15');
    fill('schedule-form-time', '18:30');
    fireEvent.click(screen.getByTestId('schedule-form-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].message).toBe('Recycling too');
    expect(onSubmit.mock.calls[0][0].send_at).toBe(
      new Date(2030, 5, 15, 18, 30, 0, 0).toISOString(),
    );
  });

  test('a missing date is called out inline rather than swallowed', async () => {
    const onSubmit = vi.fn();
    render(<ScheduleForm onSubmit={onSubmit} onCancel={() => {}} />);

    fill('schedule-form-title', 'Call the plumber');
    // Submit the form directly: the date control's native `required` would
    // otherwise stop the event in the browser layer, before our validation.
    fireEvent.submit(screen.getByTestId('schedule-form-submit').closest('form')!);

    expect(await screen.findByText('A date is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('a failure from the save shows on the form', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('you do not have access to this resource'));
    render(<ScheduleForm onSubmit={onSubmit} onCancel={() => {}} />);

    fill('schedule-form-title', 'Call the plumber');
    fill('schedule-form-date', '2030-06-15');
    fireEvent.click(screen.getByTestId('schedule-form-submit'));

    expect(
      await screen.findByText('you do not have access to this resource'),
    ).toBeInTheDocument();
  });
});
