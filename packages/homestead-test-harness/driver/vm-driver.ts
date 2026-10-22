/**
 * Driver over the VM's happy-dom document. Mirrors Playwright's semantics for
 * the subset in Driver.ts: lazy locators, strict single-match actions that wait
 * for the element to be visible and enabled, and retrying assertions.
 *
 * Visibility here is computed-style only (`hidden`, `display: none`,
 * `visibility: hidden` up the ancestor chain). There is no layout engine, so
 * "covered by another element" or "scrolled off-screen" can't be detected.
 */

import { queryAllByLabelText, queryAllByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import type {
  Driver,
  FilterOptions,
  Locator,
  LocatorAssertions,
  RoleOptions,
  SelectValue,
  TextOptions,
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
  const matches = (el: Element) => {
    const content = normalize(el.textContent ?? '');
    if (text instanceof RegExp) return text.test(content);
    return exact ? content === normalize(text) : textMatches(content, text);
  };
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

function nameMatcher(name: string | RegExp, exact?: boolean) {
  if (name instanceof RegExp) return name;
  return exact
    ? (accessibleName: string) => accessibleName === name
    : (accessibleName: string) => accessibleName.toLowerCase().includes(name.toLowerCase());
}

function queryAllByPwRole(scope: Element, role: string, opts: RoleOptions): Element[] {
  return queryAllByRole(scope as HTMLElement, role, {
    ...(opts.name === undefined ? {} : { name: nameMatcher(opts.name, opts.exact) }),
    ...(opts.level === undefined ? {} : { level: opts.level }),
  });
}

const describeRole = (role: string, opts: RoleOptions) =>
  `role=${role}${opts.name ? `[name=${String(opts.name)}]` : ''}`;

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

function strictViolation(describe: string, count: number): Error {
  return new Error(`${describe}: strict mode violation — ${count} elements match`);
}

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

  locator(css: string): Locator {
    return this.derive(() => this.resolve().flatMap((el) => Array.from(el.querySelectorAll(css))), css);
  }

  getByTestId(testId: string | RegExp): Locator {
    return this.derive(
      () => this.resolve().flatMap((el) => queryAllByTestId(el, testId)),
      `testId=${String(testId)}`,
    );
  }

  getByRole(role: string, opts: RoleOptions = {}): Locator {
    return this.derive(
      () => this.resolve().flatMap((el) => queryAllByPwRole(el, role, opts)),
      describeRole(role, opts),
    );
  }

  getByText(text: string | RegExp, opts: TextOptions = {}): Locator {
    return this.derive(
      () => this.resolve().flatMap((el) => queryAllByPwText(el, text, opts.exact)),
      `text=${String(text)}`,
    );
  }

  filter({ hasText }: FilterOptions): Locator {
    if (hasText === undefined) return this;
    return this.derive(
      () => this.resolve().filter((el) => textMatches(el.textContent ?? '', hasText)),
      `hasText=${String(hasText)}`,
    );
  }

  first(): Locator {
    return this.derive(() => this.resolve().slice(0, 1), 'first');
  }

  last(): Locator {
    return this.derive(() => this.resolve().slice(-1), 'last');
  }

  private single(): Element | undefined {
    const els = this.resolve();
    if (els.length > 1) throw strictViolation(this.describe, els.length);
    return els[0];
  }

  /** Wait for exactly one visible, enabled element (Playwright actionability). */
  private actionable(): Promise<Element> {
    return poll(
      () => this.describe,
      () => {
        const el = this.single();
        if (!el) return { ok: false, why: 'no element matches' };
        if (!isVisible(el)) return { ok: false, why: 'element is not visible' };
        if (isDisabled(el)) return { ok: false, why: 'element is disabled' };
        // Retried, like Playwright's "receives events" check: overlays such as
        // Radix dialogs disable pointer events on <body> a render before they
        // re-enable them on their own content.
        if (!receivesPointerEvents(el)) return { ok: false, why: 'element does not receive pointer events' };
        return { ok: true, value: el };
      },
    );
  }

  async click(): Promise<void> {
    await this.user.click(await this.actionable());
  }

  async fill(value: string): Promise<void> {
    const el = (await this.actionable()) as HTMLInputElement | HTMLTextAreaElement;
    el.focus();
    setNativeValue(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async selectOption(value: SelectValue): Promise<void> {
    const el = (await this.actionable()) as HTMLSelectElement;
    const option = Array.from(el.options).find((o) =>
      typeof value === 'string' ? o.value === value || o.label === value : o.label === value.label,
    );
    if (!option) throw new Error(`${this.describe}: no option ${JSON.stringify(value)}`);
    setNativeValue(el, option.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async check(): Promise<void> {
    const el = (await this.actionable()) as HTMLInputElement;
    if (!el.checked) await this.user.click(el);
    if (!el.checked) throw new Error(`${this.describe}: click did not check the element`);
  }

  getAttribute(name: string): Promise<string | null> {
    return poll(
      () => this.describe,
      () => {
        const el = this.single();
        return el ? { ok: true, value: el.getAttribute(name) } : { ok: false, why: 'no element matches' };
      },
    );
  }

  async waitFor({ state = 'visible' }: { state?: WaitState } = {}): Promise<void> {
    await poll(
      () => this.describe,
      () => {
        const els = this.resolve();
        if (state === 'detached') {
          return els.length === 0 ? { ok: true, value: undefined } : { ok: false, why: 'element is attached' };
        }
        if (state === 'hidden') {
          return els.some(isVisible) ? { ok: false, why: 'element is visible' } : { ok: true, value: undefined };
        }
        if (els.length > 1) throw strictViolation(this.describe, els.length);
        const [el] = els;
        if (!el) return { ok: false, why: 'no element matches' };
        if (state === 'visible' && !isVisible(el)) return { ok: false, why: 'element is not visible' };
        return { ok: true, value: undefined };
      },
    );
  }

  async isVisible(): Promise<boolean> {
    const el = this.single();
    return !!el && isVisible(el);
  }
}

function assertions(loc: VmLoc): LocatorAssertions {
  const one = (check: (el: Element) => string | null) =>
    poll(
      () => loc.describe,
      () => {
        const els = loc.resolve();
        if (els.length > 1) throw strictViolation(loc.describe, els.length);
        if (els.length === 0) return { ok: false, why: 'no element matches' };
        const why = check(els[0]!);
        return why ? { ok: false, why } : { ok: true, value: undefined };
      },
    );
  return {
    toBeVisible: () => one((el) => (isVisible(el) ? null : 'element is not visible')),
    toBeHidden: () =>
      poll(
        () => loc.describe,
        () =>
          loc.resolve().some(isVisible) ? { ok: false, why: 'element is visible' } : { ok: true, value: undefined },
      ),
    toBeDisabled: () => one((el) => (isDisabled(el) ? null : 'element is enabled')),
    toContainText: (text) =>
      one((el) =>
        textMatches(el.textContent ?? '', text) ? null : `text was "${normalize(el.textContent ?? '')}"`,
      ),
    toHaveCount: (count) =>
      poll(
        () => loc.describe,
        () => {
          const n = loc.resolve().length;
          return n === count ? { ok: true, value: undefined } : { ok: false, why: `count was ${n}` };
        },
      ),
    toHaveValue: (value) =>
      one((el) => {
        const actual = (el as HTMLInputElement).value;
        return actual === value ? null : `value was "${actual}"`;
      }),
  };
}

export interface VmDriverHooks {
  /** Load `path` the way a browser navigation would (the harness remounts the app). */
  navigate(path: string): Promise<void>;
  /** Requests currently in flight through the fetch shim. */
  inFlight(): number;
}

export function vmDriver(hooks: VmDriverHooks): Driver {
  const user = userEvent.setup({ delay: null, document });
  const root = () => document.body;
  const loc = (resolve: Resolve, describe: string) => new VmLoc(resolve, describe, user);

  return {
    goto: (path) => hooks.navigate(path),
    locator: (css) => loc(() => Array.from(root().querySelectorAll(css)), css),
    getByTestId: (id) => loc(() => queryAllByTestId(root(), id), `testId=${String(id)}`),
    getByRole: (role, opts: RoleOptions = {}) =>
      loc(() => queryAllByPwRole(root(), role, opts), describeRole(role, opts)),
    getByLabel: (text) =>
      loc(
        () =>
          queryAllByLabelText(root(), (content) =>
            typeof text === 'string' ? textMatches(content, text) : text.test(content),
          ),
        `label=${String(text)}`,
      ),
    getByText: (text, opts: TextOptions = {}) =>
      loc(() => queryAllByPwText(root(), text, opts.exact), `text=${String(text)}`),
    expect(locator) {
      if (!(locator instanceof VmLoc)) throw new Error('vmDriver: foreign locator');
      return assertions(locator);
    },
    async expectURL(pattern) {
      await poll(
        () => `url ${String(pattern)}`,
        () =>
          pattern.test(window.location.href)
            ? { ok: true, value: undefined }
            : { ok: false, why: `url was ${window.location.href}` },
      );
    },
    async waitForNetworkIdle() {
      let quietSince = Date.now();
      await poll(
        () => 'network idle',
        () => {
          if (hooks.inFlight() > 0) quietSince = Date.now();
          return Date.now() - quietSince >= NETWORK_QUIET_MS
            ? { ok: true, value: undefined }
            : { ok: false, why: `${hooks.inFlight()} request(s) in flight` };
        },
      );
    },
  };
}
