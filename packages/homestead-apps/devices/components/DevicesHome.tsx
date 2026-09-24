/**
 * The Devices page: every household device that reports its own battery, and
 * the per-person switch for being told when one runs low.
 *
 * Devices create their own records when they first report, so there is no
 * "add" here — only tuning a threshold or forgetting a device that's gone.
 * The low-battery todo and notification come from the `devices-low-battery`
 * sync; nothing on this page sends anything.
 */

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { ReminderOptInToggle } from '@rambleraptor/homestead-core/user-settings';
import { BATTERY_REMINDER_SETTING } from '../batteryReminderSetting';
import { useDeleteDevice, useDevices, useUpdateDevice } from '../hooks/useDevices';
import type { DeviceInfo } from '../types';
import { DeviceRow } from './DeviceRow';

export function DevicesHome() {
  const [deleteTarget, setDeleteTarget] = useState<DeviceInfo | null>(null);
  const { data: devices, isLoading, isError, error } = useDevices();
  const updateDevice = useUpdateDevice();
  const deleteDevice = useDeleteDevice();

  const handleThresholdChange = async (device: DeviceInfo, threshold: number) => {
    try {
      await updateDevice.mutateAsync({ id: device.id, data: { low_threshold: threshold } });
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDevice.mutateAsync(deleteTarget.id);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-6" data-testid="devices-home">
      <PageHeader
        title="Devices"
        subtitle="Battery levels reported by the household's devices"
      />

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Batteries
          </h2>
          <ReminderOptInToggle
            appId="devices"
            settingKey={BATTERY_REMINDER_SETTING}
            offLabel="Notify me"
            onLabel="Notifying me"
            offTitle="Get a notification when a device's battery runs low"
            onTitle="You get a notification when a device's battery runs low"
            data-testid="device-reminder-toggle"
          />
        </div>

        {isLoading && (
          <SkeletonList rows={2} label="Loading devices" data-testid="devices-loading" />
        )}

        {isError && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error instanceof Error ? error.message : 'Failed to load devices'}
          </div>
        )}

        {devices && devices.length === 0 && (
          <p
            className="rounded-2xl border border-gray-100 bg-surface-white px-4 py-8 text-center text-sm text-gray-500"
            data-testid="devices-empty"
          >
            No devices have reported yet. A device shows up here the first time
            it writes its battery level to <code>/device-infos</code>.
          </p>
        )}

        {devices && devices.length > 0 && (
          <ul
            className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-surface-white"
            data-testid="devices-list"
          >
            {devices.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                onThresholdChange={handleThresholdChange}
                onDelete={setDeleteTarget}
                busy={updateDevice.isPending}
              />
            ))}
          </ul>
        )}

        {devices && devices.length > 0 && (
          <p className="mt-2 text-xs text-gray-400">
            When a battery drops to its threshold, a “Charge the …” todo is added
            and checked off again once the device is back on the charger.
          </p>
        )}
      </section>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Forget device"
        message={
          deleteTarget
            ? `Forget “${deleteTarget.name}”? It will reappear the next time it reports.`
            : ''
        }
        confirmLabel="Forget"
        variant="danger"
        isLoading={deleteDevice.isPending}
      />
    </div>
  );
}
