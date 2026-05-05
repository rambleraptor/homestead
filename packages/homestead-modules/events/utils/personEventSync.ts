/**
 * Helpers used by the people module's create/update hooks to dual-write
 * birthday/anniversary records into the new `events` collection.
 *
 * The functions are idempotent: they look for an existing event matching
 * the (tag, sorted person ids) tuple and PATCH it; otherwise they create
 * one. When the corresponding date is removed from the person form, the
 * matching event is deleted.
 */

import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { EVENTS } from '../resources';
import type { Event } from '../types';

interface AepEventRecord extends Event {
  path?: string;
}

function personRef(personId: string): string {
  return `people/${personId}`;
}

function sortedPersonRefs(personIds: string[]): string[] {
  return [...new Set(personIds)].map(personRef).sort();
}

function refsMatch(a: string[] | undefined, b: string[]): boolean {
  if (!a) return b.length === 0;
  if (a.length !== b.length) return false;
  const sorted = [...a].sort();
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== b[i]) return false;
  }
  return true;
}

function createdByPath(): string | undefined {
  const id = aepbase.getCurrentUser()?.id;
  return id ? `users/${id}` : undefined;
}

async function findEventByTagAndPeople(
  tag: string,
  refs: string[],
): Promise<AepEventRecord | null> {
  const all = await aepbase.list<AepEventRecord>(EVENTS);
  return (
    all.find((e) => e.tag === tag && refsMatch(e.people, refs)) || null
  );
}

interface UpsertEventInput {
  tag: 'birthday' | 'anniversary' | string;
  name: string;
  date: string | undefined;
  personIds: string[];
}

/**
 * Create-or-update an event matching the given (tag, person ids) tuple.
 * If `date` is empty/undefined the matching event (if any) is deleted.
 *
 * Errors are swallowed and logged: the legacy person/shared-data write
 * has already happened, and the events collection is the new source of
 * truth — but during the transition we don't want a transient events
 * write failure to break person creation.
 */
export async function upsertPersonEvent({
  tag,
  name,
  date,
  personIds,
}: UpsertEventInput): Promise<void> {
  if (personIds.length === 0) return;
  const refs = sortedPersonRefs(personIds);

  try {
    const existing = await findEventByTagAndPeople(tag, refs);

    if (!date || !date.trim()) {
      if (existing) {
        await aepbase.remove(EVENTS, existing.id);
      }
      return;
    }

    if (existing) {
      await aepbase.update<AepEventRecord>(EVENTS, existing.id, {
        name,
        date,
        people: refs,
      });
      return;
    }

    await aepbase.create<AepEventRecord>(EVENTS, {
      name,
      date,
      tag,
      people: refs,
      created_by: createdByPath(),
    });
  } catch {
    // Dual-write best-effort; legacy fields remain authoritative.
  }
}

export async function upsertBirthdayEvent(
  personId: string,
  personName: string,
  birthday: string | undefined,
): Promise<void> {
  return upsertPersonEvent({
    tag: 'birthday',
    name: `${personName}'s Birthday`,
    date: birthday,
    personIds: [personId],
  });
}

export async function upsertAnniversaryEvent(
  personIds: string[],
  primaryName: string,
  anniversary: string | undefined,
): Promise<void> {
  return upsertPersonEvent({
    tag: 'anniversary',
    name: `${primaryName}'s Anniversary`,
    date: anniversary,
    personIds,
  });
}
