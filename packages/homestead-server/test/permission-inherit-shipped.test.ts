/**
 * Parent access inheritance over the **shipped** schema: every child resource an
 * app or core declares, created through its real parent chain under the real
 * household roles. This is the audit for turning inheritance on by default —
 * it pins, per child, who reaches it now:
 *
 *  - the member who created the chain reaches the child (unchanged);
 *  - another household member reaches it exactly when the governing ancestor is
 *    household-shared — a `private` ancestor (a vaccine) keeps its children
 *    private (unchanged: those children were private themselves);
 *  - a guest reaches no child record (unchanged), and listing children under a
 *    parent they can't read is now a 403 rather than an empty page (new);
 *  - sharing the governing record with the guest now shares the child (new);
 *  - a deny on the governing record now hides the child (new).
 *
 * A new child resource joins this audit automatically. One that should not
 * follow its parent must opt out with `independent_access`.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import type { FieldDef, ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { toWireSchema } from '@rambleraptor/homestead-core/resources/translate';
import { BUILTIN_RESOURCE_DEFS } from '@rambleraptor/homestead-core/resources/builtins';
import { PERMISSION_RESOURCE_DEFS } from '@rambleraptor/homestead-core/permissions/resources';
import { householdCollections, householdFilterFor } from '@rambleraptor/homestead-core/permissions/household';
import { seedPermissions } from '@rambleraptor/homestead-core/permissions/seed';
import { call, defineResource, makeEngine, seedUser, type TestEngine } from './engine/helpers';
import type { User } from '../src/engine/types';

const BASE = 'http://localhost:8090';

/**
 * Every app config that declares resources. Imported by a computed specifier
 * so this package's `tsc` doesn't follow the configs into the React component
 * graph behind their lazy routes — the reason `src/app-registry.js` is JS. The
 * configs only reference components through `import()` thunks, so loading
 * them at runtime pulls in no React.
 */
const APP_CONFIG_MODULES = [
  '@rambleraptor/homestead-core/notifications/app.config',
  '@rambleraptor/homestead-core/operations/app.config',
  '@rambleraptor/homestead-core/chat/app.config',
  ...[
    'credit-cards',
    'documents',
    'events',
    'games',
    'gift-cards',
    'groceries',
    'health',
    'home',
    'people',
    'receipts',
    'recipes',
    'todos',
  ].map((app) => `@rambleraptor/homestead-apps/${app}/app.config`),
];

function isAppConfig(value: unknown): value is AppConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AppConfig).id === 'string' &&
    typeof (value as AppConfig).name === 'string'
  );
}

const APPS: AppConfig[] = (
  await Promise.all(APP_CONFIG_MODULES.map((m) => import(m) as Promise<Record<string, unknown>>))
).flatMap((mod) => Object.values(mod).filter(isAppConfig));

function appDefs(app: AppConfig): ResourceDefinition[] {
  const own = typeof app.resources === 'function' ? app.resources() : (app.resources ?? []);
  return [...own, ...(app.children ?? []).flatMap(appDefs)];
}

const DEFS: ResourceDefinition[] = [
  ...BUILTIN_RESOURCE_DEFS,
  ...PERMISSION_RESOURCE_DEFS,
  ...APPS.flatMap(appDefs),
];
const BY_SINGULAR = new Map(DEFS.map((d) => [d.singular, d]));

/** Parents before children, so every definition registers after its parent. */
function topoSorted(defs: ResourceDefinition[]): ResourceDefinition[] {
  const out: ResourceDefinition[] = [];
  const seen = new Set<string>();
  const visit = (d: ResourceDefinition): void => {
    if (seen.has(d.singular)) return;
    seen.add(d.singular);
    for (const p of d.parents ?? []) {
      const parent = BY_SINGULAR.get(p);
      if (parent) visit(parent);
    }
    out.push(d);
  };
  defs.forEach(visit);
  return out;
}

/** The ancestor chain of `def`, root first, ending with `def` itself. */
function chainOf(def: ResourceDefinition): ResourceDefinition[] {
  const chain = [def];
  let parent = def.parents?.[0];
  while (parent && parent !== 'user') {
    const p = BY_SINGULAR.get(parent)!;
    chain.unshift(p);
    parent = p.parents?.[0];
  }
  return chain;
}

/** The ancestor that decides `def`'s access: the first that doesn't inherit. */
function governorOf(def: ResourceDefinition): ResourceDefinition {
  let current = def;
  for (;;) {
    const parent = BY_SINGULAR.get(current.parents![0]!)!;
    if (!parent.parents?.length || parent.independent_access) return parent;
    current = parent;
  }
}

/** A value that satisfies one declared field, or undefined to leave it out. */
function sample(field: FieldDef): unknown {
  if (field.default !== undefined) return field.default;
  if (field.enum?.length) return field.enum[0];
  switch (field.type) {
    case 'string':
      if (field.pattern === '^[0-9]{4}$') return '1234';
      return field.format === 'date-time' ? '2026-01-01T00:00:00Z' : field.format === 'date' ? '2026-01-01' : 'x';
    case 'number':
    case 'integer':
      return field.minimum ?? 1;
    case 'boolean':
      return true;
    case 'array':
      return [];
    case 'object': {
      const props = Object.entries(field.properties ?? {}).filter(([, f]) => f.required);
      return Object.fromEntries(props.map(([k, f]) => [k, sample(f)]));
    }
    default:
      return undefined;
  }
}

function sampleBody(def: ResourceDefinition): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(def.fields)) {
    if (!field.required || field.type === 'file') continue;
    body[name] = sample(field);
  }
  return body;
}

/** Children under an ordinary parent that inherit — the subject of this audit. */
const INHERITING_CHILDREN = DEFS.filter(
  (d) => (d.parents?.length ?? 0) > 0 && !d.parents!.includes('user') && !d.independent_access,
).map((d) => d.singular);

let t: TestEngine;
let maker: { user: User; token: string };
let sam: { user: User; token: string };
let guest: { user: User; token: string };

const get = (who: { token: string }, path: string) => call(t.engine, 'GET', path, { token: who.token });

async function grant(id: string, body: Record<string, unknown>): Promise<void> {
  const res = await call(t.engine, 'POST', `/access-grants?id=${id}`, { token: t.adminToken, body });
  expect(res.status, `grant ${id}: ${await res.clone().text()}`).toBe(201);
  t.engine.reloadPermissions();
}

/** Create `def`'s whole ancestor chain and one record of it; return each path. */
async function buildChain(def: ResourceDefinition): Promise<string[]> {
  const paths: string[] = [];
  let base = '';
  for (const link of chainOf(def)) {
    // Superuser-write links (none today on these chains) need the admin.
    const token = link.superuser_write ? t.adminToken : maker.token;
    const res = await call(t.engine, 'POST', `${base}/${link.plural}`, { token, body: sampleBody(link) });
    expect(res.status, `create ${link.singular} under "${base}": ${await res.clone().text()}`).toBe(201);
    const { path } = (await res.json()) as { path: string };
    paths.push(path);
    base = `/${path}`;
  }
  return paths;
}

beforeAll(async () => {
  process.env.PERMISSION_CACHE_TTL_MS = '0';
  t = await makeEngine();
  for (const def of topoSorted(DEFS)) {
    const res = await defineResource(
      t,
      {
        singular: def.singular,
        plural: def.plural,
        parents: def.parents ?? [],
        user_settable_create: def.user_settable_create ?? false,
        superuser_write: def.superuser_write ?? false,
        independent_access: def.independent_access ?? false,
        schema: toWireSchema(def.fields, def.singular),
      },
      def.singular,
    );
    expect(res.ok, `define ${def.singular}: ${await res.clone().text()}`).toBe(true);
  }
  await seedPermissions(
    BASE,
    t.adminToken,
    (input, init) => t.engine.fetch(new Request(input, init)),
    householdCollections(DEFS),
  );

  maker = await seedUser(t.engine, { email: 'maker@example.com' });
  sam = await seedUser(t.engine, { email: 'sam@example.com' });
  guest = await seedUser(t.engine, { email: 'guest@example.com' });
  for (const member of [maker, sam]) {
    const res = await call(t.engine, 'POST', '/groups/members/group-memberships', {
      token: t.adminToken,
      body: { user: member.user.id },
    });
    expect(res.status).toBe(201);
  }
  t.engine.reloadPermissions();
});

afterAll(() => {
  delete process.env.PERMISSION_CACHE_TTL_MS;
});

describe('every shipped child resource follows its governing ancestor', () => {
  test('the audit covers the children it should', () => {
    // A guard against the audit silently covering nothing.
    expect(INHERITING_CHILDREN).toEqual(
      expect.arrayContaining([
        'transaction',
        'perk',
        'redemption',
        'log',
        'vaccination',
        'run',
        'chat-message',
      ]),
    );
  });

  test.each(INHERITING_CHILDREN)('%s', async (singular) => {
    const def = BY_SINGULAR.get(singular)!;
    const governor = governorOf(def);
    const paths = await buildChain(def);
    const governorPath = paths[chainOf(def).indexOf(governor)]!;
    const governorId = governorPath.split('/').pop()!;
    const childPath = `/${paths[paths.length - 1]}`;
    const listPath = childPath.slice(0, childPath.lastIndexOf('/'));
    const householdShared = householdFilterFor(governor) === undefined;

    // Unchanged: the maker, another member (iff the ancestor is household-
    // shared), and a guest with nothing.
    expect((await get(maker, childPath)).status).toBe(200);
    expect((await get(sam, childPath)).status).toBe(householdShared ? 200 : 403);
    expect((await get(guest, childPath)).status).toBe(403);

    // New: a list under a parent you can't read is refused, as a user
    // subtree's is, rather than answered with an empty page.
    expect((await get(guest, listPath)).status).toBe(403);

    // New: sharing the governing record shares the child…
    await grant(`share-${singular}`, {
      subject_type: 'user',
      subject_id: guest.user.id,
      target_scope: 'record',
      resource_type: governor.singular,
      resource_id: governorId,
      capability: 'read',
    });
    expect((await get(guest, childPath)).status).toBe(200);
    expect((await get(guest, listPath)).status).toBe(200);

    // …and a deny on it hides the child from a member who otherwise reads it.
    await grant(`deny-${singular}`, {
      subject_type: 'user',
      subject_id: maker.user.id,
      target_scope: 'record',
      resource_type: governor.singular,
      resource_id: governorId,
      capability: 'read',
      effect: 'deny',
    });
    expect((await get(maker, childPath)).status).toBe(403);
  });

  test('the self-governing permission model opts out', () => {
    expect(BY_SINGULAR.get('group-membership')?.independent_access).toBe(true);
  });
});
