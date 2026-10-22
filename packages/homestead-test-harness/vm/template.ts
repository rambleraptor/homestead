/**
 * One fully-booted database per worker, built on the first `bootHomestead()`.
 *
 * Boots the app once, runs the schema sync + migrations + permissions seed,
 * claims the admin account, and creates a member user — the same state the
 * Playwright suite reaches through global-setup and its `testUser` fixture.
 * The result is captured with `VACUUM INTO`; every test then starts from a
 * copy of it, so per-test setup is a file copy instead of a boot + sync.
 *
 * Built in the worker rather than in a Vitest globalSetup: the worker has to
 * load the server and SPA module graphs anyway, and loading them a second
 * time in the main process cost more than the build itself.
 */

import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '@rambleraptor/homestead-server/src/app';
import { setActiveHandler } from './fetch-shim';
import { VM_ORIGIN } from './origin';

export interface VmUser {
  id: string;
  email: string;
  password: string;
}

export interface VmTemplate {
  dbPath: string;
  admin: VmUser;
  member: VmUser;
}

const ADMIN = { email: 'admin@vm.test', password: 'vm-admin-password' };
const MEMBER = { email: 'member@vm.test', password: 'vm-member-password' };
/** Seeded role-bearing group that confers the household member role. */
const MEMBER_GROUP_ID = 'members';

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  const res = await fetch(`${VM_ORIGIN}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`template: ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function buildTemplate(): Promise<VmTemplate> {
  const root = await mkdtemp(join(tmpdir(), 'homestead-vm-template-'));
  const bootDir = join(root, 'boot');
  await mkdir(bootDir);
  const app = await createApp({ dev: true, dataDir: bootDir, origin: VM_ORIGIN });
  setActiveHandler(app.fetch);
  try {
    // Lazy, like server.ts: core reads AEPBASE_URL at import time, and
    // createApp() is what sets it.
    const { syncSchema } = await import('@rambleraptor/homestead-server/src/schema-sync');
    await syncSchema(app.engine.db, app.engineBase);

    await call('/api/setup', { method: 'POST', body: JSON.stringify(ADMIN) });
    const { token: adminToken } = await call<{ token: string }>('/api/aep/users/:login', {
      method: 'POST',
      body: JSON.stringify(ADMIN),
    });
    const admin = await call<{ id: string }>('/api/aep/users/me', { token: adminToken });
    const member = await call<{ id: string }>('/api/aep/users', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        email: MEMBER.email,
        password: MEMBER.password,
        display_name: 'VM Member',
        type: 'regular',
      }),
    });
    await call(`/api/aep/groups/${MEMBER_GROUP_ID}/group-memberships`, {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ user: member.id }),
    });

    const dbPath = join(root, 'template.db');
    app.engine.db.query('VACUUM INTO ?').run(dbPath);
    return { dbPath, admin: { ...ADMIN, id: admin.id }, member: { ...MEMBER, id: member.id } };
  } finally {
    setActiveHandler(null);
    app.close();
  }
}

let template: Promise<VmTemplate> | null = null;

/** This worker's template, built on first use. The OS reclaims its tmpdir. */
export function workerTemplate(): Promise<VmTemplate> {
  template ??= buildTemplate();
  return template;
}
