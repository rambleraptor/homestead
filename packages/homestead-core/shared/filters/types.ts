/**
 * Generic module-level filter declarations.
 *
 * A module exports an array of these on `HomeModule.filters` describing
 * which record fields are filterable and how. The shared `<FilterBar>`
 * renders the right input for each `type`, and `applyFilters` evaluates
 * the values client-side against the module's loaded list.
 *
 * Decls intentionally describe *fields to match on*, not permitted values
 * — enum options are derived from the loaded data at render time so the
 * config doesn't drift from reality.
 */

export type ModuleFilterType = 'text' | 'enum' | 'boolean' | 'dateRange';

export interface ModuleFilterDecl {
  /** Stable key used for state and the omnibox manifest. */
  key: string;
  /** Human-readable label rendered above the input. */
  label: string;
  /** Input kind; drives both the UI control and match semantics. */
  type: ModuleFilterType;
  /**
   * Dot-path into the record the value is matched against. Defaults to
   * `key`. Example: `field: 'profile.displayName'`.
   */
  field?: string;
  /**
   * Enum-only: render as a multi-select chip row. Multi values combine
   * with OR semantics when applied.
   */
  multi?: boolean;
  /** Optional hint passed to the omnibox LLM. */
  description?: string;
  /** Optional placeholder for text inputs. */
  placeholder?: string;
}

/** Value shape for a dateRange filter — both bounds are optional. */
export interface DateRangeValue {
  start?: string;
  end?: string;
}
