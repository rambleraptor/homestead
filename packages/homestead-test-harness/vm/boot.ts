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
import { authStore, refreshCurrentUser } from '@rambleraptor/homestead-core/api/aepbase';
import type { User } from '@rambleraptor/homestead-core/auth/types';
import { queryClient } from '@rambleraptor/homestead-core/api/queryClient';
// Side effect: install the app registry before App reads it (as main.tsx does).
import '@/apps/registry';
import { App } from '@/App';
import type { Driver } from '../driver/Driver';
import { vmDriver } from '../driver/vm-driver';
import { aiStubFetch } from '../../../tests/e2e/config/ai-stub';
import {
  inFlightRequests,
  installFetchShim,
  onResponse,
  registerService,
  setActiveHandler,
} from './fetch-shim';
import { AI_STUB_ORIGIN, VM_ORIGIN } from './origin';
import { cancelQueryTimers, installQueryTimers } from './query-timers';
import { workerTemplate, type VmUser } from './template';

export interface Session {
  id: string;
  email: string;
  token: string;
}

export interface Harness {
  driver: Driver;
  app: HomesteadApp;
  /** The template's bootstrap superuser and member (Members group) accounts. */
  admin: VmUser;
  member: VmUser;
  /** Another member ("Sam"), writing from their own account. */
  householdMember: VmUser & { name: string };
  /**
   * Sign in and land on /dashboard, as the Playwright login fixture does.
   * By default the template's pre-minted session is installed directly;
   * `via: 'form'` goes through the real login form instead.
   */
  loginAs(user: VmUser, opts?: { via?: 'session' | 'form' }): Promise<Session>;
  close(): Promise<void>;
}

export async function bootHomestead(): Promise<Harness> {
  installFetchShim();
  installQueryTimers();
  // AI-backed server code (documents:classify) calls the provider at
  // AI_BASE_URL, which the VM config points here.
  registerService(AI_STUB_ORIGIN, aiStubFetch);
  const template = await workerTemplate();

  const dataDir = await mkdtemp(join(tmpdir(), 'homestead-vm-test-'));
  await copyFile(template.dbPath, join(dataDir, 'aepbase.db'));
  // dev: the SPA is served by the test runner's Vite, not from a built dist/.
  const app = await createApp({ dev: true, dataDir, origin: VM_ORIGIN });
  setActiveHandler(app.fetch);

  document.body.innerHTML = '';
  let root: Root | null = null;

  /**
   * Mount the SPA at `path`, replacing any mounted instance — what a page load
   * does. In-memory state (the React Query cache, component state) is lost;
   * localStorage, and with it the session and the persisted query cache,
   * survives.
   */
  async function load(path: string): Promise<void> {
    root?.unmount();
    queryClient.clear();
    window.history.replaceState({}, '', path);
    document.body.innerHTML = '<div id="root"></div>';
    root = createRoot(document.getElementById('root')!);
    root.render(createElement(BrowserRouter, null, createElement(App)));
  }

  const driver = vmDriver({ navigate: load, inFlight: inFlightRequests, onResponse });
  await load('/login');

  return {
    driver,
    app,
    admin: template.admin,
    member: template.member,
    householdMember: template.householdMember,
    async loginAs(user, { via = 'session' } = {}) {
      if (via === 'form') {
        await driver.getByLabel(/email/i).fill(user.email);
        await driver.getByLabel(/password/i).fill(user.password);
        await driver.getByRole('button', { name: /login|sign in/i }).click();
      } else {
        // A placeholder user carrying just the id; refreshCurrentUser() swaps
        // in the full record, as the app does after a login.
        authStore.save(user.token, { id: user.id } as User);
        await refreshCurrentUser();
        await load('/dashboard');
      }
      await driver.expectURL(/\/dashboard$/);
      await driver.expect(driver.getByTestId('app-shell')).toBeVisible();
      return { id: user.id, email: user.email, token: authStore.token };
    },
    async close() {
      // Let the page settle first, so no query is mid-flight when the session
      // below is cleared out from under it.
      await driver.waitForNetworkIdle();
      root?.unmount();
      // Module singletons outlive the test (and, with isolate: false, the
      // spec file): drop the session and caches so the next boot starts clean.
      queryClient.clear();
      // Before clearing storage: a pending throttled cache save would otherwise
      // land in the next test's localStorage (see query-timers.ts).
      cancelQueryTimers();
      authStore.clear();
      window.localStorage.clear();
      document.body.innerHTML = '';
      // Clearing the session kicks off a last refetch or two; let them land on
      // this app rather than fail against a torn-down one.
      await driver.waitForNetworkIdle();
      setActiveHandler(null);
      app.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
