/**
 * Grouping of sidebar entries by section, shared by the sidebar and the app
 * drawer so both list apps in the same order. A nested child files under its
 * parent's section (`entrySection`).
 */

import { entrySection, type SidebarEntry } from './sidebarPins';

/** Fixed order for the well-known sections; anything else sorts after, by name. */
const SECTION_ORDER = ['Money', 'Food', 'Relationships', 'Games'];

export interface EntrySection {
  /** The section name; `''` for apps that declare none. */
  name: string;
  entries: SidebarEntry[];
}

/**
 * Group `entries` (already in nav order) into sections. Settings always
 * comes last; the well-known sections follow `SECTION_ORDER`, with any other
 * section slotting in before Settings alphabetically.
 */
export function groupEntriesBySection(entries: readonly SidebarEntry[]): EntrySection[] {
  const bySection = new Map<string, SidebarEntry[]>();
  for (const entry of entries) {
    const name = entrySection(entry);
    const list = bySection.get(name);
    if (list) list.push(entry);
    else bySection.set(name, [entry]);
  }
  const names = [...bySection.keys()].sort((a, b) => {
    if (a === 'Settings') return 1;
    if (b === 'Settings') return -1;
    const aIndex = SECTION_ORDER.indexOf(a);
    const bIndex = SECTION_ORDER.indexOf(b);
    const aOrder = aIndex === -1 ? SECTION_ORDER.length : aIndex;
    const bOrder = bIndex === -1 ? SECTION_ORDER.length : bIndex;
    return aOrder - bOrder || a.localeCompare(b);
  });
  return names.map((name) => ({ name, entries: bySection.get(name) ?? [] }));
}
