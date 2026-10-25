/**
 * What a chat turn tells the model about its situation, beyond the tools: the
 * person's local date and time, and the notes the apps they can use give it.
 *
 * Nothing here is stored or read from household data. The timezone comes with
 * each turn from the browser; the notes are the apps' own guidance, written in
 * their configs (`AppConfig.chat.instructions`).
 */

import type { AppConfig } from '../../apps/types';
import { resolveResources } from '../../apps/registry';

/** The longest timezone name a turn may carry. IANA names stay well under it. */
export const MAX_TIMEZONE_CHARS = 64;

/**
 * `timezone` when it names a zone this runtime knows (`America/Chicago`), else
 * `'UTC'`. The name lands in the prompt, so it's held to the IANA alphabet
 * before it is ever tried.
 */
export function resolveTimezone(timezone: string | undefined): string {
  if (!timezone || timezone.length > MAX_TIMEZONE_CHARS) return 'UTC';
  if (!/^[A-Za-z0-9_+\-/]+$/.test(timezone)) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}

/**
 * `at` as the person reads a clock in `timezone`, e.g.
 * `Saturday 2026-10-24, 7:42 PM (America/Chicago)` — what "today",
 * "tomorrow" and "this afternoon" are relative to.
 */
export function localNow(timezone: string, at: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return (
    `${parts.weekday} ${parts.year}-${parts.month}-${parts.day}, ` +
    `${parts.hour}:${parts.minute} ${parts.dayPeriod} (${timezone})`
  );
}

/**
 * The notes of every app (children included) that owns at least one resource
 * in `offered`, as prompt lines under the app's name. An app whose tools the
 * person isn't offered says nothing, so the prompt never describes a tool they
 * don't have. Empty when no app has anything to say.
 */
export function appNotes(apps: readonly AppConfig[], offered: ReadonlySet<string>): string[] {
  const lines: string[] = [];
  const visit = (app: AppConfig): void => {
    const instructions = app.chat?.instructions ?? [];
    if (
      instructions.length > 0 &&
      resolveResources(app).some((def) => offered.has(def.singular))
    ) {
      lines.push(app.name, ...instructions.map((line) => `- ${line}`));
    }
    for (const child of app.children ?? []) visit(child);
  };
  for (const app of apps) visit(app);
  return lines;
}
