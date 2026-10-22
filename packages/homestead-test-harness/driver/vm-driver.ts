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
import type { Driver, FilterOptions, Locator, LocatorAssertions, RoleOptions } from './Driver';

const DEFAULT_TIMEOUT_MS = 5000;
const POLL_MS = 5;

type Resolve = () => Element[];

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function poll<T>(
  describe: () => string,
  attempt: () => { ok: true; value: T } | { ok: false; why: string },
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
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

class VmLoc implements Locator {
  constructor(
    readonly resolve: Resolve,
    readonly describe: string,
    private readonly user: ReturnType<typeof userEvent.setup>,
  ) {}

  locator(css: string): Locator {
    return new VmLoc(
      () => this.resolve().flatMap((el) => Array.from(el.querySelectorAll(css))),
      `${this.describe} >> ${css}`,
      this.user,
    );
  }

  filter({ hasText }: FilterOptions): Locator {
    if (hasText === undefined) return this;
    return new VmLoc(
      () => this.resolve().filter((el) => textMatches(el.textContent ?? '', hasText)),
      `${this.describe} >> hasText=${String(hasText)}`,
      this.user,
    );
  }

  /** Wait for exactly one visible, enabled match (Playwright actionability). */
  private actionable(): Promise<Element> {
    return poll(
      () => this.describe,
      () => {
        const els = this.resolve();
        if (els.length > 1) {
          throw new Error(`${this.describe}: strict mode violation — ${els.length} elements match`);
        }
        const [el] = els;
        if (!el) return { ok: false, why: 'no element matches' };
        if (!isVisible(el)) return { ok: false, why: 'element is not visible' };
        if ((el as HTMLButtonElement).disabled) return { ok: false, why: 'element is disabled' };
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

  async selectOption(value: string): Promise<void> {
    const el = (await this.actionable()) as HTMLSelectElement;
    const option = Array.from(el.options).find((o) => o.value === value || o.label === value);
    if (!option) throw new Error(`${this.describe}: no option "${value}"`);
    setNativeValue(el, option.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async getAttribute(name: string): Promise<string | null> {
    return poll(
      () => this.describe,
      () => {
        const els = this.resolve();
        if (els.length > 1) {
          throw new Error(`${this.describe}: strict mode violation — ${els.length} elements match`);
        }
        return els[0] ? { ok: true, value: els[0].getAttribute(name) } : { ok: false, why: 'no element matches' };
      },
    );
  }
}

function assertions(loc: VmLoc): LocatorAssertions {
  const one = (check: (el: Element) => string | null) =>
    poll(
      () => loc.describe,
      () => {
        const els = loc.resolve();
        if (els.length !== 1) return { ok: false, why: `expected one element, found ${els.length}` };
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
          loc.resolve().some(isVisible)
            ? { ok: false, why: 'element is visible' }
            : { ok: true, value: undefined },
      ),
    toContainText: (text) =>
      one((el) =>
        textMatches(el.textContent ?? '', text)
          ? null
          : `text was "${normalize(el.textContent ?? '')}"`,
      ),
    toHaveCount: (count) =>
      poll(
        () => loc.describe,
        () => {
          const n = loc.resolve().length;
          return n === count ? { ok: true, value: undefined } : { ok: false, why: `count was ${n}` };
        },
      ),
  };
}

function nameMatcher(name: string | RegExp, exact?: boolean) {
  if (name instanceof RegExp) return name;
  return exact
    ? (accessibleName: string) => accessibleName === name
    : (accessibleName: string) => accessibleName.toLowerCase().includes(name.toLowerCase());
}

export function vmDriver(): Driver {
  const user = userEvent.setup({ delay: null, document });
  const root = () => document.body;
  const loc = (resolve: Resolve, describe: string) => new VmLoc(resolve, describe, user);

  return {
    async goto(path) {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    },
    locator: (css) => loc(() => Array.from(root().querySelectorAll(css)), css),
    getByTestId: (id) =>
      loc(() => Array.from(root().querySelectorAll(`[data-testid="${CSS.escape(id)}"]`)), `testId=${id}`),
    getByRole: (role, opts: RoleOptions = {}) =>
      loc(
        () =>
          queryAllByRole(root(), role, opts.name === undefined ? {} : { name: nameMatcher(opts.name, opts.exact) }),
        `role=${role}${opts.name ? `[name=${String(opts.name)}]` : ''}`,
      ),
    getByLabel: (text) =>
      loc(
        () =>
          queryAllByLabelText(root(), (content) =>
            typeof text === 'string' ? textMatches(content, text) : text.test(content),
          ),
        `label=${String(text)}`,
      ),
    expect(locator) {
      if (!(locator instanceof VmLoc)) throw new Error('vmDriver: foreign locator');
      return assertions(locator);
    },
  };
}
