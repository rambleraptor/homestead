/**
 * A per-user reminder opt-in, rendered as a small switch on the surface it
 * governs.
 *
 * Any app that declares a boolean `userSettings` flag gets a form on the
 * Settings page for free — but nobody goes to Settings to answer a question they
 * only ever have while looking at the thing itself. This is the same value,
 * offered where it occurs to you: on the bin calendar, on the perks list.
 *
 * Purely the setting. Switching it on doesn't create anything by itself — the
 * owning app's cron picks the change up on its next run and writes the
 * reminders.
 */

import { BellOff, BellRing } from 'lucide-react';
import { useUserSetting } from '../hooks/useUserSetting';

export interface ReminderOptInToggleProps {
  /** App that declares the setting. */
  appId: string;
  /** Key of the boolean `userSettings` flag. */
  settingKey: string;
  /** Label when off — an invitation, e.g. "Remind me the night before". */
  offLabel: string;
  /** Label when on — a statement, e.g. "Reminding me". */
  onLabel: string;
  /** Tooltip when off; explain what turning it on will do. */
  offTitle?: string;
  /** Tooltip when on; explain what they'll get. */
  onTitle?: string;
  /** Distinguishes the switch when a page has more than one. */
  'data-testid'?: string;
}

export function ReminderOptInToggle({
  appId,
  settingKey,
  offLabel,
  onLabel,
  offTitle,
  onTitle,
  'data-testid': testId = 'reminder-opt-in-toggle',
}: ReminderOptInToggleProps) {
  const { value, setValue, isLoading, isSaving } = useUserSetting<boolean>(
    appId,
    settingKey,
  );
  const enabled = value === true;
  const Icon = enabled ? BellRing : BellOff;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={isLoading || isSaving}
      onClick={() => {
        // Errors surface through the global mutation error toast
        // (queryClient.ts); the switch simply stays where it was.
        void setValue(!enabled);
      }}
      data-testid={testId}
      title={enabled ? onTitle : offTitle}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        enabled
          ? 'border-brand-navy/20 bg-gray-50 text-brand-navy'
          : 'border-gray-200 text-text-muted hover:bg-gray-50'
      }`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {enabled ? onLabel : offLabel}
    </button>
  );
}
