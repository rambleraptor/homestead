/**
 * Driver over a Playwright Page: a thin pass-through, so page objects written
 * against `Driver` behave exactly as they did against `Page`.
 */

import { expect, type Locator as PwLocator, type Page } from '@playwright/test';
import { waitForNetworkIdle } from '../../../tests/e2e/utils/network';
import type {
  Driver,
  FilePayload,
  FilterOptions,
  Locator,
  LocatorAssertions,
  RoleOptions,
  SelectValue,
  TextOptions,
  TimeoutOptions,
  WaitState,
} from './Driver';

type PwRole = Parameters<Page['getByRole']>[0];

function toPwFiles(files: FilePayload | FilePayload[]) {
  const list = Array.isArray(files) ? files : [files];
  return list.map((f) => ({ name: f.name, mimeType: f.mimeType, buffer: Buffer.from(f.buffer) }));
}

class PwLoc implements Locator {
  constructor(readonly pw: PwLocator) {}
  locator(css: string): Locator {
    return new PwLoc(this.pw.locator(css));
  }
  getByTestId(testId: string | RegExp): Locator {
    return new PwLoc(this.pw.getByTestId(testId));
  }
  getByRole(role: string, opts?: RoleOptions): Locator {
    return new PwLoc(this.pw.getByRole(role as PwRole, opts));
  }
  getByText(text: string | RegExp, opts?: TextOptions): Locator {
    return new PwLoc(this.pw.getByText(text, opts));
  }
  getByLabel(text: string | RegExp, opts?: TextOptions): Locator {
    return new PwLoc(this.pw.getByLabel(text, opts));
  }
  getByPlaceholder(text: string | RegExp, opts?: TextOptions): Locator {
    return new PwLoc(this.pw.getByPlaceholder(text, opts));
  }
  filter({ hasText, hasNotText, has }: FilterOptions): Locator {
    return new PwLoc(this.pw.filter({ hasText, hasNotText, has: has ? unwrap(has) : undefined }));
  }
  or(other: Locator): Locator {
    return new PwLoc(this.pw.or(unwrap(other)));
  }
  first(): Locator {
    return new PwLoc(this.pw.first());
  }
  last(): Locator {
    return new PwLoc(this.pw.last());
  }
  nth(index: number): Locator {
    return new PwLoc(this.pw.nth(index));
  }
  async all(): Promise<Locator[]> {
    return (await this.pw.all()).map((l) => new PwLoc(l));
  }
  count(): Promise<number> {
    return this.pw.count();
  }
  click(): Promise<void> {
    return this.pw.click();
  }
  fill(value: string): Promise<void> {
    return this.pw.fill(value);
  }
  clear(): Promise<void> {
    return this.pw.clear();
  }
  pressSequentially(text: string): Promise<void> {
    return this.pw.pressSequentially(text);
  }
  press(key: string): Promise<void> {
    return this.pw.press(key);
  }
  async selectOption(value: SelectValue): Promise<void> {
    await this.pw.selectOption(value);
  }
  check(): Promise<void> {
    return this.pw.check();
  }
  uncheck(): Promise<void> {
    return this.pw.uncheck();
  }
  setInputFiles(files: FilePayload | FilePayload[]): Promise<void> {
    return this.pw.setInputFiles(toPwFiles(files));
  }
  hover(): Promise<void> {
    return this.pw.hover();
  }
  scrollIntoViewIfNeeded(): Promise<void> {
    return this.pw.scrollIntoViewIfNeeded();
  }
  getAttribute(name: string): Promise<string | null> {
    return this.pw.getAttribute(name);
  }
  textContent(): Promise<string | null> {
    return this.pw.textContent();
  }
  inputValue(): Promise<string> {
    return this.pw.inputValue();
  }
  waitFor(opts?: { state?: WaitState } & TimeoutOptions): Promise<void> {
    return this.pw.waitFor(opts);
  }
  isVisible(): Promise<boolean> {
    return this.pw.isVisible();
  }
  isChecked(): Promise<boolean> {
    return this.pw.isChecked();
  }
}

function unwrap(locator: Locator): PwLocator {
  if (!(locator instanceof PwLoc)) throw new Error('playwrightDriver: foreign locator');
  return locator.pw;
}

export function playwrightDriver(page: Page): Driver {
  return {
    async goto(path) {
      await page.goto(path);
    },
    async reload() {
      await page.reload();
    },
    url: () => page.url(),
    locator: (css) => new PwLoc(page.locator(css)),
    getByTestId: (id) => new PwLoc(page.getByTestId(id)),
    getByRole: (role, opts?: RoleOptions) => new PwLoc(page.getByRole(role as PwRole, opts)),
    getByLabel: (text, opts) => new PwLoc(page.getByLabel(text, opts)),
    getByText: (text, opts) => new PwLoc(page.getByText(text, opts)),
    getByPlaceholder: (text, opts) => new PwLoc(page.getByPlaceholder(text, opts)),
    expect(locator): LocatorAssertions {
      const pw = unwrap(locator);
      return {
        toBeVisible: (o) => expect(pw).toBeVisible(o),
        toBeHidden: (o) => expect(pw).toBeHidden(o),
        toBeAttached: (o) => expect(pw).toBeAttached(o),
        toBeEnabled: (o) => expect(pw).toBeEnabled(o),
        toBeDisabled: (o) => expect(pw).toBeDisabled(o),
        toBeChecked: (o) => expect(pw).toBeChecked(o),
        toContainText: (text, o) => expect(pw).toContainText(text, o),
        toHaveText: (text, o) => expect(pw).toHaveText(text, o),
        toHaveCount: (count, o) => expect(pw).toHaveCount(count, o),
        toHaveValue: (value, o) => expect(pw).toHaveValue(value, o),
        toHaveAttribute: (name, value, o) => expect(pw).toHaveAttribute(name, value, o),
        not: {
          toBeVisible: (o) => expect(pw).not.toBeVisible(o),
          toContainText: (text, o) => expect(pw).not.toContainText(text, o),
          toHaveCount: (count, o) => expect(pw).not.toHaveCount(count, o),
        },
      };
    },
    expectURL: (pattern, o) => expect(page).toHaveURL(pattern, o),
    waitForURL: (url, o) => page.waitForURL(url, o),
    async waitForResponse(predicate, o) {
      const res = await page.waitForResponse(
        (r) => predicate({ url: r.url(), method: r.request().method(), status: r.status(), ok: r.ok() }),
        o,
      );
      return { url: res.url(), method: res.request().method(), status: res.status(), ok: res.ok() };
    },
    // Not the built-in `networkidle`: it never resolves while the change feed
    // (/api/events) is open (see tests/e2e/utils/network.ts).
    waitForNetworkIdle: () => waitForNetworkIdle(page),
  };
}
