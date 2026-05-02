/**
 * Next.js instrumentation hook.
 *
 * Runs once when the server boots (dev + production `next start`). We
 * use it to push module-declared resource definitions to aepbase, then
 * the aggregated `module-flags` schema. This replaces the old terraform
 * `apply` step — schemas now ship with the modules that own them.
 *
 * Env vars required:
 *   AEPBASE_URL             (default: http://127.0.0.1:8090)
 *   AEPBASE_ADMIN_EMAIL
 *   AEPBASE_ADMIN_PASSWORD
 *
 * If the credentials aren't set (e.g. during `next build` in CI) the
 * sync is skipped with a warning. The app still works — callers of
 * `useModuleFlag` will see declared defaults until the schema is
 * registered, and any aepbase collection write will 404 until the
 * resource definition is applied.
 */

export async function register(): Promise<void> {
  // Only run on the Node.js runtime; the Edge runtime has no fetch-to-
  // aepbase story and this hook doesn't need to ship to browsers.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const email = process.env.AEPBASE_ADMIN_EMAIL;
  const password = process.env.AEPBASE_ADMIN_PASSWORD;
  const aepbaseUrl =
    process.env.AEPBASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8090';

  if (!email || !password) {
    console.warn(
      '[aepbase-sync] skipping schema sync — AEPBASE_ADMIN_EMAIL / AEPBASE_ADMIN_PASSWORD not set',
    );
    return;
  }

  let token: string;
  try {
    token = await login(aepbaseUrl, email, password);
  } catch (error) {
    console.error('[aepbase-sync] login failed', error);
    return;
  }

  await syncResources(aepbaseUrl, token);
  await syncModuleFlags(aepbaseUrl, token);
}

async function syncResources(
  aepbaseUrl: string,
  token: string,
): Promise<void> {
  try {
    const { getAllResourceDefs } = await import('@/modules/registry');
    const { syncResourceDefinitions } = await import(
      '@rambleraptor/homestead-core/resources/sync'
    );
    const { BUILTIN_RESOURCE_DEFS } = await import(
      '@rambleraptor/homestead-core/resources/builtins'
    );

    const defs = [...BUILTIN_RESOURCE_DEFS, ...getAllResourceDefs()];
    const result = await syncResourceDefinitions({
      aepbaseUrl,
      token,
      defs,
    });
    if (!result.created.length && !result.updated.length) {
      console.info(
        `[resources] schema already in sync (${result.unchanged.length} definitions)`,
      );
    }
  } catch (error) {
    // Don't crash the server on sync failure — the app still serves
    // pages, and a fix-and-restart cycle is fast.
    console.error('[resources] schema sync failed', error);
  }
}

async function syncModuleFlags(
  aepbaseUrl: string,
  token: string,
): Promise<void> {
  try {
    const { getAllModuleFlagDefs } = await import('@/modules/registry');
    const { syncModuleFlagsSchema } = await import(
      '@rambleraptor/homestead-core/module-flags/sync'
    );

    const defs = getAllModuleFlagDefs();
    const result = await syncModuleFlagsSchema({
      aepbaseUrl,
      token,
      defs,
    });
    if (result.action === 'noop') {
      console.info('[module-flags] schema already in sync');
    }
  } catch (error) {
    console.error('[module-flags] schema sync failed', error);
  }
}

async function login(
  aepbaseUrl: string,
  email: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${aepbaseUrl}/users/:login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`aepbase login → ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { token?: string };
  if (!body.token) {
    throw new Error('aepbase login response missing token');
  }
  return body.token;
}
