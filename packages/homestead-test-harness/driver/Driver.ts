/**
 * The page-driving surface page objects are written against, so one page
 * object runs on both tiers: the VM driver (happy-dom, in-process) and the
 * Playwright driver (a real browser).
 *
 * It is a deliberately small subset of Playwright's Locator API, with the same
 * semantics where they overlap: locators are lazy, actions wait for exactly one
 * visible match (strict mode), and assertions retry until they pass or time
 * out.
 */

export interface RoleOptions {
  /** Accessible name. A string matches as a case-insensitive substring unless `exact`. */
  name?: string | RegExp;
  exact?: boolean;
  /** Heading level, for `heading`. */
  level?: number;
}

export interface TextOptions {
  /** Match the whole text, case-sensitively, instead of a case-insensitive substring. */
  exact?: boolean;
}

export interface FilterOptions {
  /** Keep elements whose text contains this (case-insensitive) or matches it. */
  hasText?: string | RegExp;
}

export type WaitState = 'visible' | 'hidden' | 'attached' | 'detached';

/** An option's value, or `{ label }` for its visible text. */
export type SelectValue = string | { label: string };

export interface Locator {
  locator(css: string): Locator;
  getByTestId(testId: string | RegExp): Locator;
  getByRole(role: string, opts?: RoleOptions): Locator;
  getByText(text: string | RegExp, opts?: TextOptions): Locator;
  filter(opts: FilterOptions): Locator;
  first(): Locator;
  last(): Locator;
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  selectOption(value: SelectValue): Promise<void>;
  check(): Promise<void>;
  getAttribute(name: string): Promise<string | null>;
  waitFor(opts?: { state?: WaitState }): Promise<void>;
  /** Whether it is visible right now — no waiting, like Playwright's. */
  isVisible(): Promise<boolean>;
}

export interface LocatorAssertions {
  toBeVisible(): Promise<void>;
  toBeHidden(): Promise<void>;
  toBeDisabled(): Promise<void>;
  toContainText(text: string | RegExp): Promise<void>;
  toHaveCount(count: number): Promise<void>;
  toHaveValue(value: string): Promise<void>;
}

export interface Driver {
  goto(path: string): Promise<void>;
  locator(css: string): Locator;
  getByTestId(testId: string | RegExp): Locator;
  getByRole(role: string, opts?: RoleOptions): Locator;
  getByLabel(text: string | RegExp): Locator;
  getByText(text: string | RegExp, opts?: TextOptions): Locator;
  expect(locator: Locator): LocatorAssertions;
  /** Retry until the page URL matches. */
  expectURL(pattern: RegExp): Promise<void>;
  /** Wait until no requests are in flight (Playwright's `networkidle`). */
  waitForNetworkIdle(): Promise<void>;
}
