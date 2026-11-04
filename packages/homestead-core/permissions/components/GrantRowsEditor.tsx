/**
 * The shared grant-row editor: one row per grant, each `capability` × `scope`
 * (everything / an app / a collection, with an optional filter at collection
 * scope). This is the single source of the permission-editing UI — used both by
 * the superuser Role editor (a role's `grants[]`) and by the Personal Access
 * Token editor (a token's scopes), so both surfaces build permissions with the
 * exact same vocabulary and controls.
 *
 * Grants are allow-only here (no effect toggle) and never record-scoped — the
 * same subset roles have always exposed.
 */

import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { getAllApps } from '@rambleraptor/homestead-core/apps/registry';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import type { Capability, Effect } from '../resolve';

export type GrantScope = 'all' | 'app' | 'collection';

/** The editable form of a single grant row. */
export interface GrantDraft {
  key: number;
  effect: Effect;
  capability: Capability;
  target_scope: GrantScope;
  target_app: string;
  resource_type: string;
  filter: string;
}

/** A normalized grant, with scope-irrelevant fields stripped. */
export interface CleanGrant {
  target_scope: GrantScope;
  capability: Capability;
  target_app?: string;
  resource_type?: string;
  filter?: string;
  effect?: Effect;
}

let nextKey = 1;
/** A fresh grant row (allow/collection/read by default), with optional overrides. */
export function newGrantDraft(over: Partial<GrantDraft> = {}): GrantDraft {
  return {
    key: nextKey++,
    effect: 'allow',
    capability: 'read',
    target_scope: 'collection',
    target_app: '',
    resource_type: '',
    filter: '',
    ...over,
  };
}

/** Turn stored grant rows (role/token shape) into editable drafts. */
export function draftsFromGrants(
  grants: Array<{
    effect?: string;
    capability?: string;
    target_scope?: string;
    target_app?: string;
    resource_type?: string;
    filter?: string;
  }>,
): GrantDraft[] {
  return grants.map((g) =>
    newGrantDraft({
      effect: (g.effect as Effect) ?? 'allow',
      capability: (g.capability as Capability) ?? 'read',
      target_scope: (g.target_scope as GrantScope) ?? 'collection',
      target_app: g.target_app ?? '',
      resource_type: g.resource_type ?? '',
      filter: g.filter ?? '',
    }),
  );
}

/** Validate drafts before submit; returns an error message or null. */
export function validateGrantDrafts(grants: GrantDraft[]): string | null {
  for (const g of grants) {
    if (g.target_scope === 'app' && !g.target_app) return 'An app-scope grant needs an app';
    if (g.target_scope === 'collection' && !g.resource_type.trim()) {
      return 'A collection-scope grant needs a resource';
    }
  }
  return null;
}

/** Normalize drafts, dropping fields that don't apply to the chosen scope. */
export function cleanGrantDrafts(grants: GrantDraft[]): CleanGrant[] {
  return grants.map((g) => {
    // Only stamp effect for a deny; the wire schema defaults to allow, so an
    // allow grant stays byte-identical to a payload that never set it.
    const eff = g.effect === 'deny' ? { effect: 'deny' as const } : {};
    if (g.target_scope === 'all') {
      return { target_scope: 'all', capability: g.capability, ...eff };
    }
    if (g.target_scope === 'app') {
      return { target_scope: 'app', target_app: g.target_app, capability: g.capability, ...eff };
    }
    return {
      target_scope: 'collection',
      resource_type: g.resource_type.trim(),
      capability: g.capability,
      ...(g.filter.trim() ? { filter: g.filter.trim() } : {}),
      ...eff,
    };
  });
}

/** Walk the app registry (top-level + children) collecting ids and resource singulars. */
function collectAppsAndResources(): { appIds: string[]; resources: string[] } {
  const appIds = new Set<string>();
  const resources = new Set<string>();
  const visit = (app: AppConfig) => {
    appIds.add(app.id);
    // `resources` may be an array or a lazy thunk that returns one.
    const defs = typeof app.resources === 'function' ? app.resources() : app.resources ?? [];
    for (const r of defs) resources.add(r.singular);
    for (const child of app.children ?? []) visit(child);
  };
  for (const app of getAllApps()) visit(app);
  return { appIds: [...appIds].sort(), resources: [...resources].sort() };
}

/** Memoized app-id + resource-singular lists for the target pickers. */
export function useAppsAndResources() {
  return useMemo(collectAppsAndResources, []);
}

const selectClass =
  'rounded-md border border-gray-300 bg-surface-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-terracotta';

interface Props {
  grants: GrantDraft[];
  onPatch: (key: number, over: Partial<GrantDraft>) => void;
  onRemove: (key: number) => void;
  onAdd: () => void;
  /** Heading above the rows (e.g. "Grants" for roles, "Scopes" for tokens). */
  heading?: string;
  addLabel?: string;
  addTestId?: string;
  rowsTestId?: string;
  emptyHint?: string;
  /** Unique per rendered instance so two editors' datalists don't collide. */
  datalistId?: string;
}

/**
 * Render an editable list of grant rows plus an "add" button. State lives with
 * the caller (via `onPatch`/`onRemove`/`onAdd`), so this component is purely
 * presentational and reusable across the role and token editors.
 */
export function GrantRowsEditor({
  grants,
  onPatch,
  onRemove,
  onAdd,
  heading = 'Grants',
  addLabel = 'Add grant',
  addTestId,
  rowsTestId,
  emptyHint = 'No grants — this confers no access until you add one.',
  datalistId = 'grant-resource-options',
}: Props) {
  const { appIds, resources } = useAppsAndResources();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-main">{heading}</span>
        <Button type="button" variant="secondary" size="sm" onClick={onAdd} data-testid={addTestId}>
          <Plus className="w-4 h-4 mr-1" />
          {addLabel}
        </Button>
      </div>

      {grants.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyHint}</p>
      ) : (
        <ul className="space-y-2" data-testid={rowsTestId}>
          {grants.map((g) => (
            <li
              key={g.key}
              className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 p-2"
            >
              <select
                className={selectClass}
                value={g.effect}
                onChange={(e) => onPatch(g.key, { effect: e.target.value as Effect })}
                aria-label="effect"
              >
                <option value="allow">allow</option>
                <option value="deny">deny</option>
              </select>
              <select
                className={selectClass}
                value={g.capability}
                onChange={(e) => onPatch(g.key, { capability: e.target.value as Capability })}
                aria-label="capability"
              >
                <option value="read">read</option>
                <option value="write">write</option>
                <option value="manage">manage</option>
              </select>
              <span className="text-sm text-text-muted">on</span>
              <select
                className={selectClass}
                value={g.target_scope}
                onChange={(e) => onPatch(g.key, { target_scope: e.target.value as GrantScope })}
                aria-label="scope"
              >
                <option value="all">everything</option>
                <option value="app">an app</option>
                <option value="collection">a collection</option>
              </select>

              {g.target_scope === 'app' && (
                <select
                  className={selectClass}
                  value={g.target_app}
                  onChange={(e) => onPatch(g.key, { target_app: e.target.value })}
                  aria-label="app"
                >
                  <option value="">Select an app…</option>
                  {appIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              )}

              {g.target_scope === 'collection' && (
                <>
                  <input
                    className={selectClass}
                    list={datalistId}
                    value={g.resource_type}
                    onChange={(e) => onPatch(g.key, { resource_type: e.target.value })}
                    placeholder="resource (e.g. recipe)"
                    aria-label="resource"
                  />
                  <input
                    className={`${selectClass} flex-1 min-w-[8rem]`}
                    value={g.filter}
                    onChange={(e) => onPatch(g.key, { filter: e.target.value })}
                    placeholder="filter (optional, e.g. created_by == subject.id)"
                    aria-label="filter"
                  />
                </>
              )}

              <button
                type="button"
                className="ml-auto text-gray-400 hover:text-red-600"
                onClick={() => onRemove(g.key)}
                title="Remove grant"
                aria-label="remove grant"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <datalist id={datalistId}>
        {resources.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  );
}
