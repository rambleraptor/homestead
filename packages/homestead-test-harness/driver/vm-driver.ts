/**
 * Driver over the VM's happy-dom document. Mirrors Playwright's semantics for
 * the subset in Driver.ts: lazy locators, strict single-match actions that wait
 * for the element to be visible and enabled, and retrying assertions.
 *
 * Visibility here is computed-style only (`hidden`, `display: none`,
 * `visibility: hidden` up the ancestor chain). There is no layout engine, so
 * "covered by another element" or "scrolled off-screen" can't be detected.
 */

import { queryAllByLabelText, queryAllByPlaceholderText, queryAllByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type {
  Driver,
  FilePayload,
  FilterOptions,
  Locator,
  LocatorAssertions,
  ResponseInfo,
  RoleOptions,
  SelectValue,
  TextOptions,
  TimeoutOptions,
  WaitState,
} from './Driver';

const DEFAULT_TIMEOUT_MS = 5000;
const POLL_MS = 5;
/** How long the network must stay quiet to count as idle. */
const NETWORK_QUIET_MS = 20;

type Resolve = () => Element[];
type Attempt<T> = () => { ok: true; value: T } | { ok: false; why: string };

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

function textMatches(actual: string, expected: string | RegExp): boolean {
  const text = normalize(actual);
  return typeof expected === 'string'
    ? text.toLowerCase().includes(normalize(expected).toLowerCase())
    : expected.test(text);
}

/** Playwright's string matching for text/label/placeholder: substring, or whole string when `exact`. */
function stringMatcher(expected: string | RegExp, exact?: boolean) {
  return (content: string) => {
    if (expected instanceof RegExp) return expected.test(normalize(content));
    return exact ? normalize(content) === normalize(expected) : textMatches(content, expected);
  };
}

function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  for (let node: Element | null = el; node; node = node.parentElement) {
    if ((node as HTMLElement).hidden) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none') return false;
    if (node === el && style.visibility === 'hidden') return false;
  }
  return true;
}

function isDisabled(el: Element): boolean {
  return (el as HTMLButtonElement).disabled === true || !!el.closest('fieldset[disabled]');
}

function isChecked(el: Element): boolean {
  if (el instanceof HTMLInputElement) return el.checked;
  return el.getAttribute('aria-checked') === 'true';
}

/**
 * Whether pointer events reach the element: the nearest `pointer-events`
 * declaration up the tree isn't `none`. (happy-dom doesn't inherit the
 * property into computed style, so walk it the way user-event does.)
 */
function receivesPointerEvents(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const value = getComputedStyle(node).pointerEvents;
    if (value && value !== 'inherit' && value !== 'unset') return value !== 'none';
  }
  return true;
}

const IGNORED_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD']);

/**
 * Playwright's text matching: the deepest elements whose normalized text
 * matches — an element is skipped when one of its children matches on its own.
 */
function queryAllByPwText(scope: Element, text: string | RegExp, exact?: boolean): Element[] {
  const matches = (el: Element) => stringMatcher(text, exact)(el.textContent ?? '');
  return Array.from(scope.querySelectorAll('*')).filter(
    (el) =>
      !IGNORED_TEXT_TAGS.has(el.tagName) &&
      matches(el) &&
      !Array.from(el.children).some((child) => matches(child)),
  );
}

function queryAllByTestId(scope: Element, testId: string | RegExp): Element[] {
  if (typeof testId === 'string') {
    return Array.from(scope.querySelectorAll(`[data-testid="${CSS.escape(testId)}"]`));
  }
  return Array.from(scope.querySelectorAll('[data-testid]')).filter((el) =>
    testId.test(el.getAttribute('data-testid') ?? ''),
  );
}

function queryAllByPwRole(scope: Element, role: string, opts: RoleOptions): Element[] {
  const name = opts.name;
  return queryAllByRole(scope as HTMLElement, role, {
    ...(name === undefined
      ? {}
      : { name: name instanceof RegExp ? name : stringMatcher(name, opts.exact) }),
    ...(opts.level === undefined ? {} : { level: opts.level }),
    ...(opts.checked === undefined ? {} : { checked: opts.checked }),
  });
}

const describeRole = (role: string, opts: RoleOptions) =>
  `role=${role}${opts.name ? `[name=${String(opts.name)}]` : ''}`;

/** Keep `els` in document order with duplicates dropped (for `or`). */
function inDocumentOrder(els: Element[]): Element[] {
  return [...new Set(els)].sort((a, b) =>
    a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function poll<T>(describe: () => string, attempt: Attempt<T>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = attempt();
    if (result.ok) return result.value;
    if (Date.now() > deadline) {
      throw new Error(
        `${describe()}: timed out after ${timeoutMs}ms — ${result.why}\n` +
          `page text: ${normalize(document.body.textContent ?? '').slice(0, 2000)}`,
      );
    }
    await sleep(POLL_MS);
  }
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  // Go through the prototype's setter so React's value tracker sees a change.
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function dispatchValueEvents(el: Element) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** A FileList-alike: `length`, index access and `item()` are all React and app code read. */
function fileList(files: File[]): FileList {
  const list = Object.assign(Object.create(null), files, {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    [Symbol.iterator]: () => files[Symbol.iterator](),
  });
  return list as FileList;
}

function strictViolation(describe: string, count: number): Error {
  return new Error(`${describe}: strict mode violation — ${count} elements match`);
}

const ok = { ok: true as const, value: undefined };

type User = ReturnType<typeof userEvent.setup>;

class VmLoc implements Locator {
  constructor(
    readonly resolve: Resolve,
    readonly describe: string,
    private readonly user: User,
  ) {}

  private derive(resolve: Resolve, step: string): VmLoc {
    return new VmLoc(resolve, `${this.describe} >> ${step}`, this.user);
  }

  private within(query: (scope: Element) => Element[], step: string): VmLoc {
    return this.derive(() => this.resolve().flatMap(query), step);
  }

  locator(css: string): Locator {
    return this.within((el) => Array.from(el.querySelectorAll(css)), css);
  }

  getByTestId(testId: string | RegExp): Locator {
    return this.within((el) => queryAllByTestId(el, testId), `testId=${String(testId)}`);
  }

  getByRole(role: string, opts: RoleOptions = {}): Locator {
    return this.within((el) => queryAllByPwRole(el, role, opts), describeRole(role, opts));
  }

  getByText(text: string | RegExp, opts: TextOptions = {}): Locator {
    return this.within((el) => queryAllByPwText(el, text, opts.exact), `text=${String(text)}`);
  }

  getByLabel(text: string | RegExp, opts: TextOptions = {}): Locator {
    return this.within(
      (el) => queryAllByLabelText(el as HTMLElement, stringMatcher(text, opts.exact)),
      `label=${String(text)}`,
    );
  }

  getByPlaceholder(text: string | RegExp, opts: TextOptions = {}): Locator {
    return this.within(
      (el) => queryAllByPlaceholderText(el as HTMLElement, stringMatcher(text, opts.exact)),
      `placeholder=${String(text)}`,
    );
  }

  filter({ hasText, hasNotText, has }: FilterOptions): Locator {
    let loc: VmLoc = this;
    if (hasText !== undefined) {
      const prev = loc;
      loc = prev.derive(
        () => prev.resolve().filter((el) => textMatches(el.textContent ?? '', hasText)),
        `hasText=${String(hasText)}`,
      );
    }
    if (hasNotText !== undefined) {
      const prev = loc;
      loc = prev.derive(
        () => prev.resolve().filter((el) => !textMatches(el.textContent ?? '', hasNotText)),
        `hasNotText=${String(hasNotText)}`,
      );
    }
    if (has !== undefined) {
      if (!(has instanceof VmLoc)) throw new Error('vmDriver: foreign locator');
      const inner = has.resolve;
      const prev = loc;
      // `has` is relative: evaluate it against the whole document, then keep
      // the candidates containing one of its matches.
      loc = prev.derive(
        () => {
          const hits = inner();
          return prev.resolve().filter((el) => hits.some((h) => el !== h && el.contains(h)));
        },
        `has=(${has.describe})`,
      );
    }
    return loc;
  }

  or(other: Locator): Locator {
    if (!(other instanceof VmLoc)) throw new Error('vmDriver: foreign locator');
    return new VmLoc(
      () => inDocumentOrder([...this.resolve(), ...other.resolve()]),
      `(${this.describe}) or (${other.describe})`,
      this.user,
    );
  }

  first(): Locator {
    return this.derive(() => this.resolve().slice(0, 1), 'first');
  }

  last(): Locator {
    return this.derive(() => this.resolve().slice(-1), 'last');
  }

  nth(index: number): Locator {
    return this.derive(() => {
      const els = this.resolve();
      const el = index < 0 ? els[els.length + index] : els[index];
      return el ? [el] : [];
    }, `nth=${index}`);
  }

  async all(): Promise<Locator[]> {
    return this.resolve().map((_, i) => this.nth(i));
  }

  async count(): Promise<number> {
    return this.resolve().length;
  }

  private single(): Element | undefined {
    const els = this.resolve();
    if (els.length > 1) throw strictViolation(this.describe, els.length);
    return els[0];
  }

  /** Wait for exactly one element (strict mode), optionally visible and enabled. */
  private waitForOne(requireActionable: boolean, timeout?: number): Promise<Element> {
    return poll(
      () => this.describe,
      () => {
        const el = this.single();
        if (!el) return { ok: false, why: 'no element matches' };
        if (!requireActionable) return { ok: true, value: el };
        if (!isVisible(el)) return { ok: false, why: 'element is not visible' };
        if (isDisabled(el)) return { ok: false, why: 'element is disabled' };
        // Retried, like Playwright's "receives events" check: overlays such as
        // Radix dialogs disable pointer events on <body> a render before they
        // re-enable them on their own content.
        if (!receivesPointerEvents(el)) return { ok: false, why: 'element does not receive pointer events' };
        return { ok: true, value: el };
      },
      timeout,
    );
  }

  private actionable(): Promise<Element> {
    return this.waitForOne(true);
  }

  async click(): Promise<void> {
    await this.user.click(await this.actionable());
  }

  async hover(): Promise<void> {
    await this.user.hover(await this.actionable());
  }

  async fill(value: string): Promise<void> {
    const el = (await this.actionable()) as HTMLInputElement | HTMLTextAreaElement;
    el.focus();
    setNativeValue(el, value);
    dispatchValueEvents(el);
  }

  clear(): Promise<void> {
    return this.fill('');
  }

  async pressSequentially(text: string): Promise<void> {
    const el = (await this.actionable()) as HTMLElement;
    el.focus();
    // `{` and `[` are user-event's key-descriptor syntax; double them to type them.
    await this.user.keyboard(text.replace(/[{[]/g, (c) => c + c));
  }

  async press(key: string): Promise<void> {
    const el = (await this.actionable()) as HTMLElement;
    el.focus();
    await this.user.keyboard(`{${key}}`);
  }

  async selectOption(value: SelectValue): Promise<void> {
    const el = (await this.actionable()) as HTMLSelectElement;
    const option = Array.from(el.options).find((o) =>
      typeof value === 'string' ? o.value === value || o.label === value : o.label === value.label,
    );
    if (!option) throw new Error(`${this.describe}: no option ${JSON.stringify(value)}`);
    setNativeValue(el, option.value);
    dispatchValueEvents(el);
  }

  private async setChecked(checked: boolean): Promise<void> {
    const el = await this.actionable();
    if (isChecked(el) !== checked) await this.user.click(el);
    if (isChecked(el) !== checked) {
      throw new Error(`${this.describe}: click did not ${checked ? 'check' : 'uncheck'} the element`);
    }
  }

  check(): Promise<void> {
    return this.setChecked(true);
  }

  uncheck(): Promise<void> {
    return this.setChecked(false);
  }

  async setInputFiles(files: FilePayload | FilePayload[]): Promise<void> {
    // Like Playwright, file inputs are usually hidden behind a styled button,
    // so this needs the input attached, not visible.
    const el = (await this.waitForOne(false)) as HTMLInputElement;
    const list = (Array.isArray(files) ? files : [files]).map(
      (f) => new File([new Uint8Array(f.buffer)], f.name, { type: f.mimeType }),
    );
    Object.defineProperty(el, 'files', { configurable: true, get: () => fileList(list) });
    dispatchValueEvents(el);
  }

  async scrollIntoViewIfNeeded(): Promise<void> {
    // No layout, nothing to scroll: just wait for the element like Playwright does.
    await this.waitForOne(false);
  }

  async getAttribute(name: string): Promise<string | null> {
    return (await this.waitForOne(false)).getAttribute(name);
  }

  async textContent(): Promise<string | null> {
    return (await this.waitForOne(false)).textContent;
  }

  async inputValue(): Promise<string> {
    return ((await this.waitForOne(false)) as HTMLInputElement).value;
  }

  async waitFor({ state = 'visible', timeout }: { state?: WaitState } & TimeoutOptions = {}): Promise<void> {
    await poll(
      () => this.describe,
      () => {
        const els = this.resolve();
        if (state === 'detached') {
          return els.length === 0 ? ok : { ok: false, why: 'element is attached' };
        }
        if (state === 'hidden') {
          return els.some(isVisible) ? { ok: false, why: 'element is visible' } : ok;
        }
        if (els.length > 1) throw strictViolation(this.describe, els.length);
        const [el] = els;
        if (!el) return { ok: false, why: 'no element matches' };
        if (state === 'visible' && !isVisible(el)) return { ok: false, why: 'element is not visible' };
        return ok;
      },
      timeout,
    );
  }

  async isVisible(): Promise<boolean> {
    const el = this.single();
    return !!el && isVisible(el);
  }

  async isChecked(): Promise<boolean> {
    return isChecked(await this.waitForOne(false));
  }
}

function assertions(loc: VmLoc): LocatorAssertions {
  const describe = () => loc.describe;
  /** Retry `check` against exactly one element (Playwright's strict assertions). */
  const one = (check: (el: Element) => string | null, timeout?: number) =>
    poll(
      describe,
      () => {
        const els = loc.resolve();
        if (els.length > 1) throw strictViolation(loc.describe, els.length);
        if (els.length === 0) return { ok: false, why: 'no element matches' };
        const why = check(els[0]!);
        return why ? { ok: false, why } : ok;
      },
      timeout,
    );
  const count = (accept: (n: number) => boolean, expected: string, timeout?: number) =>
    poll(
      describe,
      () => {
        const n = loc.resolve().length;
        return accept(n) ? ok : { ok: false, why: `count was ${n}, expected ${expected}` };
      },
      timeout,
    );
  const text = (el: Element) => normalize(el.textContent ?? '');
  const valueMatches = (actual: string | null, expected: string | RegExp) =>
    actual !== null && (typeof expected === 'string' ? actual === expected : expected.test(actual));

  return {
    toBeVisible: (o) => one((el) => (isVisible(el) ? null : 'element is not visible'), o?.timeout),
    toBeHidden: (o) =>
      poll(describe, () => (loc.resolve().some(isVisible) ? { ok: false, why: 'element is visible' } : ok), o?.timeout),
    toBeAttached: (o) => one(() => null, o?.timeout),
    toBeEnabled: (o) => one((el) => (isDisabled(el) ? 'element is disabled' : null), o?.timeout),
    toBeDisabled: (o) => one((el) => (isDisabled(el) ? null : 'element is enabled'), o?.timeout),
    toBeChecked: (o) => one((el) => (isChecked(el) ? null : 'element is not checked'), o?.timeout),
    toContainText: (expected, o) =>
      one((el) => (textMatches(el.textContent ?? '', expected) ? null : `text was "${text(el)}"`), o?.timeout),
    toHaveText: (expected, o) =>
      one((el) => {
        const actual = text(el);
        const matches = typeof expected === 'string' ? actual === normalize(expected) : expected.test(actual);
        return matches ? null : `text was "${actual}"`;
      }, o?.timeout),
    toHaveCount: (n, o) => count((actual) => actual === n, String(n), o?.timeout),
    toHaveValue: (expected, o) =>
      one((el) => {
        const actual = (el as HTMLInputElement).value;
        return valueMatches(actual, expected) ? null : `value was "${actual}"`;
      }, o?.timeout),
    toHaveAttribute: (name, expected, o) =>
      one((el) => {
        const actual = el.getAttribute(name);
        return valueMatches(actual, expected) ? null : `${name} was ${JSON.stringify(actual)}`;
      }, o?.timeout),
    not: {
      toBeVisible: (o) =>
        poll(describe, () => (loc.resolve().some(isVisible) ? { ok: false, why: 'element is visible' } : ok), o?.timeout),
      toContainText: (expected, o) =>
        one((el) => (textMatches(el.textContent ?? '', expected) ? `text was "${text(el)}"` : null), o?.timeout),
      toHaveCount: (n, o) => count((actual) => actual !== n, `not ${n}`, o?.timeout),
    },
  };
}

export interface VmDriverHooks {
  /** Load `path` the way a browser navigation would (the harness remounts the app). */
  navigate(path: string): Promise<void>;
  /** Requests currently in flight through the fetch shim (long-lived streams excluded). */
  inFlight(): number;
  /** Subscribe to the responses the app sends; returns the unsubscribe. */
  onResponse(listener: (res: ResponseInfo) => void): () => void;
}

function urlMatches(url: string | RegExp, href: string): boolean {
  if (url instanceof RegExp) return url.test(href);
  const { pathname, search } = new URL(href);
  // Playwright's `**/path` glob form, or a baseURL-relative path.
  if (url.startsWith('**')) return (pathname + search).endsWith(url.slice(2));
  return pathname + search === url || pathname === url;
}

export function vmDriver(hooks: VmDriverHooks): Driver {
  const user = userEvent.setup({ delay: null, document });
  const root = () => document.body;
  const loc = (resolve: Resolve, describe: string) => new VmLoc(resolve, describe, user);

  const waitForURL = async (url: string | RegExp, opts?: TimeoutOptions) => {
    await poll(
      () => `url ${String(url)}`,
      () => (urlMatches(url, window.location.href) ? ok : { ok: false, why: `url was ${window.location.href}` }),
      opts?.timeout,
    );
  };

  return {
    goto: (path) => hooks.navigate(path),
    reload: () => hooks.navigate(window.location.pathname + window.location.search),
    url: () => window.location.href,
    locator: (css) => loc(() => Array.from(root().querySelectorAll(css)), css),
    getByTestId: (id) => loc(() => queryAllByTestId(root(), id), `testId=${String(id)}`),
    getByRole: (role, opts: RoleOptions = {}) =>
      loc(() => queryAllByPwRole(root(), role, opts), describeRole(role, opts)),
    getByLabel: (text, opts: TextOptions = {}) =>
      loc(() => queryAllByLabelText(root(), stringMatcher(text, opts.exact)), `label=${String(text)}`),
    getByText: (text, opts: TextOptions = {}) =>
      loc(() => queryAllByPwText(root(), text, opts.exact), `text=${String(text)}`),
    getByPlaceholder: (text, opts: TextOptions = {}) =>
      loc(
        () => queryAllByPlaceholderText(root(), stringMatcher(text, opts.exact)),
        `placeholder=${String(text)}`,
      ),
    expect(locator) {
      if (!(locator instanceof VmLoc)) throw new Error('vmDriver: foreign locator');
      return assertions(locator);
    },
    expectURL: (pattern, opts) => waitForURL(pattern, opts),
    waitForURL,
    waitForResponse(predicate, opts) {
      const timeout = opts?.timeout ?? DEFAULT_TIMEOUT_MS;
      return new Promise<ResponseInfo>((resolve, reject) => {
        const timer = setTimeout(() => {
          unsubscribe();
          reject(new Error(`waitForResponse: no matching response within ${timeout}ms`));
        }, timeout);
        const unsubscribe = hooks.onResponse((res) => {
          if (!predicate(res)) return;
          clearTimeout(timer);
          unsubscribe();
          resolve(res);
        });
      });
    },
    async waitForNetworkIdle() {
      let quietSince = Date.now();
      await poll(
        () => 'network idle',
        () => {
          if (hooks.inFlight() > 0) quietSince = Date.now();
          return Date.now() - quietSince >= NETWORK_QUIET_MS
            ? ok
            : { ok: false, why: `${hooks.inFlight()} request(s) in flight` };
        },
      );
    },
  };
}
