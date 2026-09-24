/**
 * One device: its charge, when it last checked in, and the threshold at which
 * a "charge this" todo is raised.
 */

import { BatteryCharging, Trash2 } from 'lucide-react';
import type { DeviceInfo } from '../types';
import {
  batteryOf,
  isLow,
  reportedAgo,
  thresholdOf,
  THRESHOLD_OPTIONS,
} from '../utils/battery';

interface DeviceRowProps {
  device: DeviceInfo;
  onThresholdChange: (device: DeviceInfo, threshold: number) => void;
  onDelete: (device: DeviceInfo) => void;
  busy?: boolean;
}

export function DeviceRow({ device, onThresholdChange, onDelete, busy }: DeviceRowProps) {
  const battery = batteryOf(device);
  const low = isLow(device);
  const threshold = thresholdOf(device);
  const options = THRESHOLD_OPTIONS.includes(threshold as (typeof THRESHOLD_OPTIONS)[number])
    ? THRESHOLD_OPTIONS
    : [...THRESHOLD_OPTIONS, threshold].sort((a, b) => a - b);
  const selectId = `device-threshold-${device.id}`;

  return (
    <li className="flex flex-wrap items-center gap-4 px-4 py-3" data-testid="device-row">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900" data-testid="device-name">
          {device.name}
        </p>
        <p className="text-xs text-gray-500" data-testid="device-reported">
          {reportedAgo(device.reported_at)}
          {device.firmware ? ` · ${device.firmware}` : ''}
        </p>
      </div>

      <div className="flex w-32 items-center gap-2">
        <div
          className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"
          role="meter"
          aria-label={`${device.name} battery`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={battery ?? undefined}
        >
          <div
            className={`h-full rounded-full ${low ? 'bg-red-500' : 'bg-green-500'}`}
            style={{ width: `${battery ?? 0}%` }}
          />
        </div>
        <span
          className={`w-10 text-right text-sm tabular-nums ${low ? 'font-semibold text-red-600' : 'text-gray-700'}`}
          data-testid="device-battery"
        >
          {battery === null ? '—' : `${Math.round(battery)}%`}
        </span>
        {device.charging && (
          <BatteryCharging className="h-4 w-4 text-green-600" aria-label="Charging" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor={selectId} className="text-xs text-gray-500">
          Remind at
        </label>
        <select
          id={selectId}
          value={threshold}
          disabled={busy}
          onChange={(e) => onThresholdChange(device, Number(e.target.value))}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          data-testid="device-threshold"
        >
          {options.map((value) => (
            <option key={value} value={value}>
              {value}%
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onDelete(device)}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-red-600"
          aria-label={`Forget ${device.name}`}
          data-testid="device-delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
