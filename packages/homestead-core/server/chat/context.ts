/**
 * What a chat turn tells the model about its situation, beyond the tools: the
 * person's local date and time, who else shares the Homestead, and the notes
 * the apps they can use give it.
 *
 * The timezone comes with each turn from the browser; the household from the
 * directory (`../household`); the notes are the apps' own guidance, written in
 * their configs (`AppConfig.chat.instructions`).
 */

import type { AppConfig, ChatContextInput } from '../../apps/types';
import type { HouseholdMember } from '../../household/types';
import { logger } from '../../utils/logger';
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

/** The longest name the prompt carries for one person. */
export const MAX_MEMBER_NAME_CHARS = 60;

/**
 * A person's name as the prompt carries it. A name is whatever someone typed,
 * so it is held to one line, cut to {@link MAX_MEMBER_NAME_CHARS} and quoted —
 * data, not instructions.
 */
export function promptName(name: string): string {
  return JSON.stringify(name.replace(/\s+/g, ' ').trim().slice(0, MAX_MEMBER_NAME_CHARS));
}

/**
 * One line per household member other than `selfId`, e.g.
 * `- "Sam": user id "u2" (admin)`.
 */
export function householdLines(members: readonly HouseholdMember[], selfId: string): string[] {
  return members
    .filter((m) => m.id !== selfId)
    .map((m) => `- ${promptName(m.name)}: user id ${JSON.stringify(m.id)}${m.admin ? ' (admin)' : ''}`);
}

/** How long one app's context provider may take before the turn goes on without it. */
export const CONTEXT_TIMEOUT_MS = 2000;

/** The most lines one app's context provider may add. */
export const MAX_CONTEXT_LINES = 30;

/**
 * What the apps know about the person talking (`AppChatConfig.context`), as
 * prompt lines under each app's name — for the apps that own at least one
 * resource in `offered`, like {@link appNotes}. Providers run together; one that
 * throws or outlasts {@link CONTEXT_TIMEOUT_MS} is logged and left out, and each
 * keeps at most {@link MAX_CONTEXT_LINES} lines.
 */
export async function appContext(
  apps: readonly AppConfig[],
  offered: ReadonlySet<string>,
  input: ChatContextInput,
  timeoutMs: number = CONTEXT_TIMEOUT_MS,
): Promise<string[]> {
  const providers: AppConfig[] = [];
  const visit = (app: AppConfig): void => {
    if (app.chat?.context && resolveResources(app).some((def) => offered.has(def.singular))) {
      providers.push(app);
    }
    for (const child of app.children ?? []) visit(child);
  };
  for (const app of apps) visit(app);

  const sections = await Promise.all(
    providers.map(async (app) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const run = app.chat!.context!().then((m) => m.default(input));
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`took longer than ${timeoutMs}ms`)), timeoutMs);
        });
        const lines = (await Promise.race([run, timeout])).slice(0, MAX_CONTEXT_LINES);
        return lines.length > 0 ? [app.name, ...lines.map((line) => `- ${line}`)] : [];
      } catch (err) {
        logger.warn(`chat: ${app.id}'s context was left out of the turn`, {
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return sections.flat();
}
