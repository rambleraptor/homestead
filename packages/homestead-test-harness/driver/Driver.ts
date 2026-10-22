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
}

export interface FilterOptions {
  /** Keep elements whose text contains this (case-insensitive) or matches it. */
  hasText?: string | RegExp;
}

export interface Locator {
  locator(css: string): Locator;
  filter(opts: FilterOptions): Locator;
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  selectOption(value: string): Promise<void>;
  getAttribute(name: string): Promise<string | null>;
}

export interface LocatorAssertions {
  toBeVisible(): Promise<void>;
  toBeHidden(): Promise<void>;
  toContainText(text: string | RegExp): Promise<void>;
  toHaveCount(count: number): Promise<void>;
}

export interface Driver {
  goto(path: string): Promise<void>;
  locator(css: string): Locator;
  getByTestId(testId: string): Locator;
  getByRole(role: string, opts?: RoleOptions): Locator;
  getByLabel(text: string | RegExp): Locator;
  expect(locator: Locator): LocatorAssertions;
}
