/**
 * Omnibox — shared types.
 *
 * Modules declare an `OmniboxAdapter` in their `module.config.ts` pointing at
 * components and hooks they already export. All runtime behaviour (LLM
 * prompt construction, dispatch, form rendering, submit wiring, list
 * filtering, toast on success, swap-to-list after success) lives in the
 * shared infra under this directory. See `parsed-booping-treasure.md`.
 *
 * Filter declarations are *not* part of the omnibox adapter — they live
 * at the module top level (`HomeModule.filters`) so both the visible
 * `<FilterBar>` and the omnibox manifest read from the same source.
 */

import type { ComponentType, ReactNode } from 'react';
import type { z } from 'zod';

/**
 * Declarative description of an action form.
 *
 * The adapter supplies:
 *  - `render` — a render function that returns the module's real form UI
 *    with `initialValues`, `onSubmit`, `onCancel`, `isSubmitting` already
 *    wired. Using a render function (instead of a bare component) lets
 *    each module bridge its existing form prop shape without a wrapper
 *    file.
 *  - `useMutation` — the React Query mutation hook the form submits to.
 *  - `paramSchema` — zod schema the LLM fills in for `formPrefill`.
 */
export interface OmniboxForm<TValues = Record<string, unknown>> {
  /** Stable identifier, e.g. `create-person`. */
  id: string;
  /** Short label shown in the inline banner. */
  label: string;
  /** Description shown to the LLM. */
  description: string;
  /**
   * Renders the module's real form. The shared infra supplies the
   * props — the module just plugs in its existing form component.
   */
  render: (props: {
    initialValues: Partial<TValues>;
    onSubmit: (values: TValues) => Promise<void>;
    onCancel: () => void;
    isSubmitting: boolean;
  }) => ReactNode;
  /** React Query mutation the form submits to. */
  useMutation: () => {
    mutateAsync: (values: TValues) => Promise<unknown>;
    isPending: boolean;
  };
  /** LLM fills in a subset of this. Validated client-side before rendering. */
  paramSchema: z.ZodType<Partial<TValues>>;
  /** Optional success toast message. */
  successMessage?: (values: TValues) => string;
}

/**
 * One module's contribution to the omnibox. Wired onto `HomeModule.omnibox`.
 */
export interface OmniboxAdapter {
  /** Words the LLM uses to match user queries to this module. */
  synonyms: string[];
  /** The module's main list/home component (e.g. `PeopleHome`). */
  listComponent: ComponentType;
  /** Declarative catalog of forms the omnibox can open for this module. */
  forms?: OmniboxForm[];
}

/**
 * Parsed intent returned by `/api/omnibox/parse`. One of two kinds.
 */
export type OmniboxIntent =
  | {
      kind: 'list';
      moduleId: string;
      filters?: Record<string, unknown>;
      confidence: number;
      rationale?: string;
    }
  | {
      kind: 'form';
      moduleId: string;
      formId: string;
      formPrefill?: Record<string, unknown>;
      confidence: number;
      rationale?: string;
    };

/**
 * Shape of the parse endpoint's JSON response.
 */
export interface OmniboxParseResponse {
  intent: OmniboxIntent | null;
  /** True when we fell back to keyword matching (no LLM). */
  fallback: boolean;
  /** Error message when no intent could be inferred. */
  message?: string;
}
