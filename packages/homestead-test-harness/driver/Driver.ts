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
  /** Match only checked (or unchecked) checkboxes/radios. */
  checked?: boolean;
}

export interface TextOptions {
  /** Match the whole text, case-sensitively, instead of a case-insensitive substring. */
  exact?: boolean;
}

export interface FilterOptions {
  /** Keep elements whose text contains this (case-insensitive) or matches it. */
  hasText?: string | RegExp;
  /** Keep elements whose text does not contain (or match) this. */
  hasNotText?: string | RegExp;
  /** Keep elements containing a match for this locator (relative to each element). */
  has?: Locator;
}

export type WaitState = 'visible' | 'hidden' | 'attached' | 'detached';

/** An option's value, or `{ label }` for its visible text. */
export type SelectValue = string | { label: string };

/** A file to put in an `<input type="file">`, as Playwright's `setInputFiles` takes it. */
export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Uint8Array;
}

/** How long an assertion or wait may retry before failing. */
export interface TimeoutOptions {
  timeout?: number;
}

export interface Locator {
  locator(css: string): Locator;
  getByTestId(testId: string | RegExp): Locator;
  getByRole(role: string, opts?: RoleOptions): Locator;
  getByText(text: string | RegExp, opts?: TextOptions): Locator;
  getByLabel(text: string | RegExp, opts?: TextOptions): Locator;
  getByPlaceholder(text: string | RegExp, opts?: TextOptions): Locator;
  filter(opts: FilterOptions): Locator;
  /** Elements matching this locator or `other`, in document order. */
  or(other: Locator): Locator;
  first(): Locator;
  last(): Locator;
  nth(index: number): Locator;
  /** One locator per current match. */
  all(): Promise<Locator[]>;
  count(): Promise<number>;
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  clear(): Promise<void>;
  /** Type into the element key by key (fires a keydown/keypress/input/keyup per character). */
  pressSequentially(text: string): Promise<void>;
  /** Press one key (`Enter`, `Escape`, `Tab`, …) with the element focused. */
  press(key: string): Promise<void>;
  selectOption(value: SelectValue): Promise<void>;
  check(): Promise<void>;
  uncheck(): Promise<void>;
  setInputFiles(files: FilePayload | FilePayload[]): Promise<void>;
  hover(): Promise<void>;
  scrollIntoViewIfNeeded(): Promise<void>;
  getAttribute(name: string): Promise<string | null>;
  textContent(): Promise<string | null>;
  inputValue(): Promise<string>;
  waitFor(opts?: { state?: WaitState } & TimeoutOptions): Promise<void>;
  /** Whether it is visible right now — no waiting, like Playwright's. */
  isVisible(): Promise<boolean>;
  isChecked(): Promise<boolean>;
}

export interface LocatorAssertions {
  toBeVisible(opts?: TimeoutOptions): Promise<void>;
  toBeHidden(opts?: TimeoutOptions): Promise<void>;
  toBeAttached(opts?: TimeoutOptions): Promise<void>;
  toBeEnabled(opts?: TimeoutOptions): Promise<void>;
  toBeDisabled(opts?: TimeoutOptions): Promise<void>;
  toBeChecked(opts?: TimeoutOptions): Promise<void>;
  toContainText(text: string | RegExp, opts?: TimeoutOptions): Promise<void>;
  /** The whole (whitespace-normalized) text equals `text`, or matches it. */
  toHaveText(text: string | RegExp, opts?: TimeoutOptions): Promise<void>;
  toHaveCount(count: number, opts?: TimeoutOptions): Promise<void>;
  toHaveValue(value: string | RegExp, opts?: TimeoutOptions): Promise<void>;
  toHaveAttribute(name: string, value: string | RegExp, opts?: TimeoutOptions): Promise<void>;
  /** The negations Playwright specs use, under `not`. */
  not: {
    toBeVisible(opts?: TimeoutOptions): Promise<void>;
    toContainText(text: string | RegExp, opts?: TimeoutOptions): Promise<void>;
    toHaveCount(count: number, opts?: TimeoutOptions): Promise<void>;
  };
}

/** What a waited-for response looks like to a predicate. */
export interface ResponseInfo {
  url: string;
  method: string;
  status: number;
  ok: boolean;
}

export interface Driver {
  goto(path: string): Promise<void>;
  /** Load the current URL again, like a browser reload. */
  reload(): Promise<void>;
  /** The current page URL. */
  url(): string;
  locator(css: string): Locator;
  getByTestId(testId: string | RegExp): Locator;
  getByRole(role: string, opts?: RoleOptions): Locator;
  getByLabel(text: string | RegExp, opts?: TextOptions): Locator;
  getByText(text: string | RegExp, opts?: TextOptions): Locator;
  getByPlaceholder(text: string | RegExp, opts?: TextOptions): Locator;
  expect(locator: Locator): LocatorAssertions;
  /** Retry until the page URL matches. */
  expectURL(pattern: RegExp, opts?: TimeoutOptions): Promise<void>;
  /** Wait for the URL: a RegExp tests the full URL, a string must equal the path (`'/dashboard'`). */
  waitForURL(url: string | RegExp, opts?: TimeoutOptions): Promise<void>;
  /**
   * Resolve with the first response, after this call, that `predicate` accepts.
   * Start it before the action that triggers the request, as with Playwright.
   */
  waitForResponse(predicate: (res: ResponseInfo) => boolean, opts?: TimeoutOptions): Promise<ResponseInfo>;
  /** Wait until no requests are in flight (`networkidle`, minus long-lived streams). */
  waitForNetworkIdle(): Promise<void>;
}
