/**
 * Driver over a Playwright Page: a thin pass-through, so page objects written
 * against `Driver` behave exactly as they did against `Page`.
 */

import { expect, type Locator as PwLocator, type Page } from '@playwright/test';
import type { Driver, FilterOptions, Locator, LocatorAssertions, RoleOptions } from './Driver';

class PwLoc implements Locator {
  constructor(readonly pw: PwLocator) {}
  locator(css: string): Locator {
    return new PwLoc(this.pw.locator(css));
  }
  filter(opts: FilterOptions): Locator {
    return new PwLoc(this.pw.filter(opts));
  }
  click(): Promise<void> {
    return this.pw.click();
  }
  fill(value: string): Promise<void> {
    return this.pw.fill(value);
  }
  async selectOption(value: string): Promise<void> {
    await this.pw.selectOption(value);
  }
  getAttribute(name: string): Promise<string | null> {
    return this.pw.getAttribute(name);
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
      new PwLoc(page.getByRole(role as Parameters<Page['getByRole']>[0], opts)),
    getByLabel: (text) => new PwLoc(page.getByLabel(text)),
    expect(locator): LocatorAssertions {
      const pw = unwrap(locator);
      return {
        toBeVisible: () => expect(pw).toBeVisible(),
        toBeHidden: () => expect(pw).toBeHidden(),
        toContainText: (text) => expect(pw).toContainText(text),
        toHaveCount: (count) => expect(pw).toHaveCount(count),
      };
    },
  };
}
