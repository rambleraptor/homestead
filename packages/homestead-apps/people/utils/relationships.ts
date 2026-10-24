/**
 * Pure helpers for `person-relationship` rows: reading a person's relatives
 * out of the full row list, and working out which rows to create or delete
 * when a person's relatives are edited.
 *
 * No client imports, so the server-side bulk import and migration use the
 * same rules as the SPA.
 */

import type {
  PersonRelationship,
  RelatedPerson,
  RelationshipKind,
} from '../types';

/** A stored reference may be a bare id or a `people/{id}` path. */
export function personIdOf(ref: string): string {
  return ref.startsWith('people/') ? ref.slice('people/'.length) : ref;
}

export interface Link {
  kind: RelationshipKind;
  person_a: string;
  person_b: string;
}

/**
 * The stored form of a link. `parent` keeps its direction (a is the parent of
 * b); partner and sibling put the lower id first so a pair has one spelling.
 */
export function canonicalLink(kind: RelationshipKind, a: string, b: string): Link {
  const [x, y] = [personIdOf(a), personIdOf(b)];
  if (kind === 'parent' || x <= y) return { kind, person_a: x, person_b: y };
  return { kind, person_a: y, person_b: x };
}

export function linkKey(link: Link): string {
  const { kind, person_a, person_b } = canonicalLink(link.kind, link.person_a, link.person_b);
  return `${kind}|${person_a}|${person_b}`;
}

function involves(row: Link, personId: string): boolean {
  return personIdOf(row.person_a) === personId || personIdOf(row.person_b) === personId;
}

function otherSide(row: Link, personId: string): string {
  const a = personIdOf(row.person_a);
  return a === personId ? personIdOf(row.person_b) : a;
}

export interface Relatives {
  partner?: RelatedPerson;
  parents: RelatedPerson[];
  children: RelatedPerson[];
  /** Stored sibling links first, then siblings inferred from a shared parent. */
  siblings: RelatedPerson[];
}

/**
 * A person's relatives, named from `nameById`. Ids with no name (a person who
 * no longer exists) are dropped.
 */
export function relativesFor(
  personId: string,
  rows: PersonRelationship[],
  nameById: Map<string, string>,
): Relatives {
  const related = (id: string, inferred?: boolean): RelatedPerson | undefined => {
    const name = nameById.get(id);
    if (!name) return undefined;
    return inferred ? { id, name, inferred } : { id, name };
  };
  const present = (p: RelatedPerson | undefined): p is RelatedPerson => !!p;
  const byName = (a: RelatedPerson, b: RelatedPerson) => a.name.localeCompare(b.name);

  const partnerIds: string[] = [];
  const parentIds = new Set<string>();
  const childIds = new Set<string>();
  const siblingIds = new Set<string>();

  for (const row of rows) {
    if (!involves(row, personId)) continue;
    const other = otherSide(row, personId);
    if (other === personId) continue;
    if (row.kind === 'partner') partnerIds.push(other);
    else if (row.kind === 'sibling') siblingIds.add(other);
    else if (row.kind === 'parent') {
      if (personIdOf(row.person_b) === personId) parentIds.add(other);
      else childIds.add(other);
    }
  }

  // Other children of my parents are my siblings, even without a sibling row.
  const inferredIds = new Set<string>();
  for (const row of rows) {
    if (row.kind !== 'parent') continue;
    const child = personIdOf(row.person_b);
    if (
      parentIds.has(personIdOf(row.person_a)) &&
      child !== personId &&
      !siblingIds.has(child)
    ) {
      inferredIds.add(child);
    }
  }

  return {
    partner: partnerIds.map((id) => related(id)).find(present),
    parents: [...parentIds].map((id) => related(id)).filter(present).sort(byName),
    children: [...childIds].map((id) => related(id)).filter(present).sort(byName),
    siblings: [
      ...[...siblingIds].map((id) => related(id)).filter(present).sort(byName),
      ...[...inferredIds].map((id) => related(id, true)).filter(present).sort(byName),
    ],
  };
}

export interface DesiredRelatives {
  partnerId?: string;
  parentIds?: string[];
  childIds?: string[];
  siblingIds?: string[];
}

export interface RelationshipPlan {
  create: Link[];
  /** Ids of rows to delete. */
  remove: string[];
}

/**
 * The rows to create and delete so that `personId`'s stored links match
 * `desired`. Every row touching `personId` is in scope. A person has at most one
 * partner, so naming a new partner also unlinks that partner's previous one.
 */
export function planRelationships(
  personId: string,
  rows: PersonRelationship[],
  desired: DesiredRelatives,
): RelationshipPlan {
  const wanted = new Map<string, Link>();
  const want = (kind: RelationshipKind, a: string, b: string) => {
    if (personIdOf(a) === personIdOf(b)) return;
    const link = canonicalLink(kind, a, b);
    wanted.set(linkKey(link), link);
  };

  const partnerId = desired.partnerId ? personIdOf(desired.partnerId) : undefined;
  if (partnerId) want('partner', personId, partnerId);
  for (const id of desired.parentIds ?? []) want('parent', id, personId);
  for (const id of desired.childIds ?? []) want('parent', personId, id);
  for (const id of desired.siblingIds ?? []) want('sibling', personId, id);

  const remove: string[] = [];
  const kept = new Set<string>();
  for (const row of rows) {
    const key = linkKey(row);
    if (involves(row, personId)) {
      // A duplicate of a link already kept is removed too.
      if (wanted.has(key) && !kept.has(key)) kept.add(key);
      else remove.push(row.id);
    } else if (partnerId && row.kind === 'partner' && involves(row, partnerId)) {
      remove.push(row.id);
    }
  }

  return {
    create: [...wanted].filter(([key]) => !kept.has(key)).map(([, link]) => link),
    remove,
  };
}
