/**
 * `bootHomestead()` — one test's world: a fresh copy of the template database,
 * the real server's fetch handler over it, and the real SPA mounted into the
 * happy-dom document, all in this worker. No browser, no sockets.
 */

import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { createApp, type HomesteadApp } from '@rambleraptor/homestead-server/src/app';
import { authStore } from '@rambleraptor/homestead-core/api/aepbase';
import { queryClient } from '@rambleraptor/homestead-core/api/queryClient';
// Side effect: install the app registry before App reads it (as main.tsx does).
import '@/apps/registry';
import { App } from '@/App';
import type { Driver } from '../driver/Driver';
import { vmDriver } from '../driver/vm-driver';
import { installFetchShim, setActiveHandler } from './fetch-shim';
import { VM_ORIGIN } from './origin';
import { workerTemplate } from './template';

export interface Harness {
  driver: Driver;
  app: HomesteadApp;
  /** Log in through the real login form as the template's member user. */
  loginAsMember(): Promise<{ id: string; token: string }>;
  close(): Promise<void>;
}

export async function bootHomestead(): Promise<Harness> {
  installFetchShim();
  const template = await workerTemplate();

  const dataDir = await mkdtemp(join(tmpdir(), 'homestead-vm-test-'));
  await copyFile(template.dbPath, join(dataDir, 'aepbase.db'));
  // dev: the SPA is served by the test runner's Vite, not from a built dist/.
  const app = await createApp({ dev: true, dataDir, origin: VM_ORIGIN });
  setActiveHandler(app.fetch);

  window.history.replaceState({}, '', '/login');
  document.body.innerHTML = '<div id="root"></div>';
  const root: Root = createRoot(document.getElementById('root')!);
  root.render(createElement(BrowserRouter, null, createElement(App)));

  const driver = vmDriver();

  return {
    driver,
    app,
    async loginAsMember() {
      const { email, password, id } = template.member;
      await driver.getByLabel(/email/i).fill(email);
      await driver.getByLabel(/password/i).fill(password);
      await driver.getByRole('button', { name: /login|sign in/i }).click();
      await driver.expect(driver.getByTestId('app-shell')).toBeVisible();
      return { id, token: authStore.token };
    },
    async close() {
      root.unmount();
      // Module singletons outlive the test (Vitest isolates per file, not per
      // test): drop the session and caches so the next boot starts clean.
      queryClient.clear();
      authStore.clear();
      window.localStorage.clear();
      document.body.innerHTML = '';
      setActiveHandler(null);
      app.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
