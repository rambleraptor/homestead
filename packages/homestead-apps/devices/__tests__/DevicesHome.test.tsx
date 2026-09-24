/**
 * The Devices page: the list and its states, the low-battery highlight, and
 * the threshold picker writing through to the record.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeviceInfo } from '../types';

const useDevices = vi.fn();
const updateAsync = vi.fn();
const deleteAsync = vi.fn();

vi.mock('../hooks/useDevices', () => ({
  useDevices: () => useDevices(),
  useUpdateDevice: () => ({ mutateAsync: updateAsync, isPending: false }),
  useDeleteDevice: () => ({ mutateAsync: deleteAsync, isPending: false }),
}));

vi.mock('@rambleraptor/homestead-core/user-settings', () => ({
  ReminderOptInToggle: (props: { 'data-testid'?: string }) => (
    <button type="button" data-testid={props['data-testid']} />
  ),
}));

import { DevicesHome } from '../components/DevicesHome';

const device = (over: Partial<DeviceInfo> = {}): DeviceInfo => ({
  id: 'fridge-panel',
  name: 'Fridge panel',
  battery_percent: 64,
  ...over,
});

function setup(data: DeviceInfo[] | undefined, extra: Record<string, unknown> = {}) {
  useDevices.mockReturnValue({ data, isLoading: false, isError: false, error: null, ...extra });
  render(<DevicesHome />);
}

beforeEach(() => {
  useDevices.mockReset();
  updateAsync.mockReset().mockResolvedValue(undefined);
  deleteAsync.mockReset().mockResolvedValue(undefined);
});

describe('DevicesHome', () => {
  it('shows the empty state before any device reports', () => {
    setup([]);
    expect(screen.getByTestId('devices-empty')).toBeInTheDocument();
  });

  it('renders an inline error when the list fails to load', () => {
    setup(undefined, { isError: true, error: new Error('boom') });
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('lists each device with its charge', () => {
    setup([device(), device({ id: 'doorbell', name: 'Doorbell', battery_percent: undefined })]);
    const rows = screen.getAllByTestId('device-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByTestId('device-battery')).toHaveTextContent('64%');
    expect(within(rows[1]!).getByTestId('device-battery')).toHaveTextContent('—');
  });

  it('highlights a device at or below its threshold', () => {
    setup([device({ battery_percent: 12 })]);
    expect(screen.getByTestId('device-battery')).toHaveClass('text-red-600');
  });

  it('writes a new threshold to the record', async () => {
    setup([device()]);
    await userEvent.selectOptions(screen.getByTestId('device-threshold'), '30');
    expect(updateAsync).toHaveBeenCalledWith({
      id: 'fridge-panel',
      data: { low_threshold: 30 },
    });
  });

  it('forgets a device after confirmation', async () => {
    setup([device()]);
    await userEvent.click(screen.getByTestId('device-delete'));
    await userEvent.click(screen.getByRole('button', { name: /^forget$/i }));
    expect(deleteAsync).toHaveBeenCalledWith('fridge-panel');
  });
});
