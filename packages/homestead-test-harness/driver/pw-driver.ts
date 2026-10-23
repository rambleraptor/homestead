/**
 * Driver over a Playwright Page: a thin pass-through, so page objects written
 * against `Driver` behave exactly as they did against `Page`.
 */

import { expect, type Locator as PwLocator, type Page } from '@playwright/test';
import { waitForNetworkIdle } from '../../../tests/e2e/utils/network';
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

type PwRole = Parameters<Page['getByRole']>[0];

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
  filter(opts: FilterOptions): Locator {
    return new PwLoc(this.pw.filter(opts));
  }
  first(): Locator {
    return new PwLoc(this.pw.first());
  }
  last(): Locator {
    return new PwLoc(this.pw.last());
  }
  click(): Promise<void> {
    return this.pw.click();
  }
  fill(value: string): Promise<void> {
    return this.pw.fill(value);
  }
  async selectOption(value: SelectValue): Promise<void> {
    await this.pw.selectOption(value);
  }
  check(): Promise<void> {
    return this.pw.check();
  }
  getAttribute(name: string): Promise<string | null> {
    return this.pw.getAttribute(name);
  }
  waitFor(opts?: { state?: WaitState }): Promise<void> {
    return this.pw.waitFor(opts);
  }
  isVisible(): Promise<boolean> {
    return this.pw.isVisible();
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
    locator: (css) => new PwLoc(page.locator(css)),
    getByTestId: (id) => new PwLoc(page.getByTestId(id)),
    getByRole: (role, opts?: RoleOptions) =>
      new PwLoc(page.getByRole(role as PwRole, opts)),
    getByLabel: (text) => new PwLoc(page.getByLabel(text)),
    getByText: (text, opts) => new PwLoc(page.getByText(text, opts)),
    expect(locator): LocatorAssertions {
      const pw = unwrap(locator);
      return {
        toBeVisible: () => expect(pw).toBeVisible(),
        toBeHidden: () => expect(pw).toBeHidden(),
        toBeDisabled: () => expect(pw).toBeDisabled(),
        toContainText: (text) => expect(pw).toContainText(text),
        toHaveCount: (count) => expect(pw).toHaveCount(count),
        toHaveValue: (value) => expect(pw).toHaveValue(value),
      };
    },
    expectURL: (pattern) => expect(page).toHaveURL(pattern),
    // Not the built-in `networkidle`: it never resolves while the change feed
    // (/api/events) is open (see tests/e2e/utils/network.ts).
    waitForNetworkIdle: () => waitForNetworkIdle(page),
  };
}
