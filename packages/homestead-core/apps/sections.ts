/**
 * Grouping of navigation apps by their `web.section`, shared by the sidebar
 * and the app drawer so both list apps in the same order.
 */

import type { AppConfig } from './types';

/** Fixed order for the well-known sections; anything else sorts after, by name. */
const SECTION_ORDER = ['Money', 'Food', 'Relationships', 'Games'];

export interface AppSection {
  /** The section name; `''` for apps that declare none. */
  name: string;
  apps: AppConfig[];
}

/**
 * Group `apps` (already sorted by `navOrder`) into sections. Settings always
 * comes last; the well-known sections follow `SECTION_ORDER`, with any other
 * section slotting in before Settings alphabetically.
 */
export function groupAppsBySection(apps: readonly AppConfig[]): AppSection[] {
  const bySection = new Map<string, AppConfig[]>();
  for (const app of apps) {
    const name = app.web?.section || '';
    const list = bySection.get(name);
    if (list) list.push(app);
    else bySection.set(name, [app]);
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
  return names.map((name) => ({ name, apps: bySection.get(name) ?? [] }));
}
