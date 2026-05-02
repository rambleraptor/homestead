/**
 * Next.js instrumentation hook.
 *
 * Runs once when the server boots (dev + production `next start`). We
 * use it to push the aggregated `module-flags` resource definition to
 * aepbase so that each declared flag is a real field on the singleton
 * resource.
 *
 * Env vars required:
 *   AEPBASE_URL             (default: http://127.0.0.1:8090)
 *   AEPBASE_ADMIN_EMAIL
 *   AEPBASE_ADMIN_PASSWORD
 *
 * If the credentials aren't set (e.g. during `next build` in CI) the
 * sync is skipped with a warning. The app still works — callers of
 * `useModuleFlag` will see declared defaults until the schema is
 * registered.
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
      '[module-flags] skipping schema sync — AEPBASE_ADMIN_EMAIL / AEPBASE_ADMIN_PASSWORD not set',
    );
    return;
  }

  try {
    const { getAllModuleFlagDefs } = await import('@/modules/registry');
    const { syncModuleFlagsSchema } = await import(
      '@rambleraptor/homestead-core/module-flags/sync'
    );

    const token = await login(aepbaseUrl, email, password);
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
    // Don't crash the server on sync failure — callers still get
    // declared defaults. Log loudly so developers notice.
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
