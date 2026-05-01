#!/usr/bin/env tsx
/**
 * Apply the homestead aepbase schema.
 *
 * The TypeScript analogue of `terraform apply` for the
 * `aep_aep-resource-definition` resources we used to manage with
 * Terraform. Walks every per-module `resources.ts`, plus the dynamic
 * `module-flag` definition built from declared module flags, and
 * idempotently POSTs/PATCHes them via aepbase's
 * `/aep-resource-definitions` meta-API.
 *
 * Usage:
 *
 *   AEPBASE_ADMIN_EMAIL=admin@example.com \
 *   AEPBASE_ADMIN_PASSWORD=... \
 *   npm run apply-schema
 *
 *   # Or, point at a non-default URL or pass an existing token:
 *   AEPBASE_URL=http://localhost:8092 \
 *   AEPBASE_TOKEN=eyJ... \
 *   npm run apply-schema
 *
 * Exit code 0 iff every resource synced cleanly. Per-resource failures
 * are reported but don't abort the whole run, so a single bad
 * definition can't block the rest.
 */

import { ALL_DOMAIN_RESOURCES } from '@/core/aep/registry';
import { syncAllResourceDefinitions } from '@/core/aep/sync';
import type { AepResourceDefinition } from '@/core/aep/types';
import { getAllModuleFlagDefs } from '@/modules/registry';
import { buildModuleFlagsResourceDefinition } from '@/modules/settings/flags';

async function main(): Promise<void> {
  const aepbaseUrl = (
    process.env.AEPBASE_URL || 'http://127.0.0.1:8090'
  ).replace(/\/$/, '');

  const token = process.env.AEPBASE_TOKEN || (await loginFromEnv(aepbaseUrl));

  const moduleFlagsDef = buildModuleFlagsResourceDefinition(
    getAllModuleFlagDefs(),
  );
  const defs: AepResourceDefinition[] = [
    ...ALL_DOMAIN_RESOURCES,
    moduleFlagsDef,
  ];

  console.log(
    `[apply-schema] syncing ${defs.length} resource definitions to ${aepbaseUrl}`,
  );

  const { results, failures } = await syncAllResourceDefinitions({
    aepbaseUrl,
    token,
    defs,
  });

  for (const r of results) {
    console.log(`  ${pad(r.action)}  ${r.singular}`);
  }
  for (const f of failures) {
    console.error(`  failed   ${f.singular}: ${f.error.message}`);
  }

  const created = results.filter((r) => r.action === 'created').length;
  const updated = results.filter((r) => r.action === 'updated').length;
  const noop = results.filter((r) => r.action === 'noop').length;
  console.log(
    `[apply-schema] ${created} created, ${updated} updated, ${noop} unchanged, ${failures.length} failed`,
  );

  if (failures.length > 0) process.exit(1);
}

async function loginFromEnv(aepbaseUrl: string): Promise<string> {
  const email = process.env.AEPBASE_ADMIN_EMAIL;
  const password = process.env.AEPBASE_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      'apply-schema: set AEPBASE_ADMIN_EMAIL + AEPBASE_ADMIN_PASSWORD ' +
        '(or AEPBASE_TOKEN to skip login)',
    );
    process.exit(2);
  }
  const res = await fetch(`${aepbaseUrl}/users/:login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(
      `aepbase login → ${res.status}: ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error('aepbase login response missing token');
  return body.token;
}

function pad(s: string): string {
  return s.padEnd(7, ' ');
}

main().catch((err) => {
  console.error('apply-schema: unexpected error', err);
  process.exit(1);
});
