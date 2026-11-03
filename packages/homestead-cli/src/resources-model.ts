import axios from 'axios';
import { APIClient, Client, logger } from '@aep_dev/aep-lib-ts';
import type { OpenAPI, Resource } from '@aep_dev/aep-lib-ts';
import type { BulkImportFormatInfo } from '@rambleraptor/homestead-client';
import { withoutCollectionMethods } from './openapi-filter.ts';
import { getProfile, type Profile } from './credentials.ts';

// aep-lib-ts logs OpenAPI parsing at INFO; silence it so command output is clean.
logger.settings.minLevel = 7;

/** How `homestead resources` finds and authenticates to a running aepbase. */
export interface ConnectOptions {
  /**
   * App origin or engine base URL. Wins over a profile and `port`. A trailing
   * `/api/aep` is optional — it's normalized away to recover the origin.
   */
  serverUrl?: string;
  /** App port (default 3000) when neither `serverUrl` nor a profile is given. */
  port?: number;
  /** Login profile label to use; defaults to the stored default profile. */
  profile?: string;
  /** Pre-obtained bearer token; overrides any stored profile. */
  token?: string;
  /** Account email (with `password`); logs in fresh, overriding any profile. */
  email?: string;
  /** Account password (with `email`). */
  password?: string;
}

/** An AEP-136 custom method advertised by `/api/custom-methods`. */
export interface CustomMethodInfo {
  /** Plural of the resource the method lives on, e.g. `groceries`. */
  plural: string;
  /** Kebab-case custom verb, e.g. `process-image`. */
  verb: string;
  /** `collection` (`/<plural>:<verb>`) or `item` (`/<plural>/<id>:<verb>`). */
  target: 'collection' | 'item';
  /** HTTP method the gateway expects (default POST). */
  method: string;
  /** Long-running (AEP-151): answers with an operation. */
  async?: boolean;
  /** Present on `:bulk-import` — the formats this server offers. */
  bulk_import?: { formats: BulkImportFormatInfo[] };
  /** Present on `:bulk-export` — its formats and options. */
  bulk_export?: {
    formats: Array<{ id: string; label: string; mime_type: string; extension: string }>;
    options: Array<{ id: string; label: string; type: 'boolean'; default?: boolean }>;
  };
}

/** Everything a verb handler needs to talk to aepbase + the sidecar. */
export interface ResourceContext {
  apiClient: APIClient;
  client: Client;
  serverUrl: string;
  /** Gateway base URL — where custom methods are invoked (same server). */
  sidecarUrl: string;
  /** Bearer token of the authenticated caller. */
  token: string;
  /** The caller's user id (sent as `X-User-Id` to the custom-method gateway). */
  userId: string;
  /** Resource model keyed by singular, e.g. `gift-card`. */
  resources: Record<string, Resource>;
  /** Custom methods registered on the gateway, across all resources. */
  customMethods: CustomMethodInfo[];
}

/**
 * A failure to reach or authenticate against aepbase — distinct from a failed
 * CRUD call so the caller can pick the right exit code (1 vs 2).
 */
export class ConnectError extends Error {}

/**
 * Locate the running aepbase, authenticate, fetch its OpenAPI document, and
 * build the aep-lib-ts model + REST client from it. Throws `ConnectError`
 * with an operator-friendly message when the server is unreachable or the
 * schema hasn't been synced yet.
 */
export async function connect(opts: ConnectOptions): Promise<ResourceContext> {
  // The engine is reachable only under /api/aep on the app origin; the
  // custom-method gateway (/api/custom-methods, /api/aep/<plural>:<verb>)
  // lives at the origin root.
  const profile = resolveProfile(opts);
  const origin = resolveOrigin(opts, profile);
  const serverUrl = `${origin}/api/aep`;
  const sidecarUrl = origin;
  await probe(origin);

  const { token, userId } = await resolveAuth(serverUrl, opts, profile);
  const openapi = await fetchOpenApi(serverUrl);

  const apiClient = await APIClient.fromOpenAPI(withoutCollectionMethods(openapi), serverUrl);
  const resources = apiClient.resources();
  patchCreateMethods(resources, openapi);
  if (Object.keys(resources).length === 0) {
    throw new ConnectError(
      `aepbase at ${serverUrl} serves no resources yet — bring the sidecar up ` +
        'once with AEPBASE_ADMIN_EMAIL/AEPBASE_ADMIN_PASSWORD so the schema syncs.',
    );
  }

  const customMethods = await fetchCustomMethods(sidecarUrl);

  const http = axios.create({ timeout: 30_000 });
  const headers = { Authorization: `Bearer ${token}` };
  const noop = (): void => {};
  const client = new Client(http, headers, noop, noop);

  return {
    apiClient,
    client,
    serverUrl,
    sidecarUrl,
    token,
    userId,
    resources,
    customMethods,
  };
}

/**
 * Fetch the registered custom methods. Best-effort: the `resources` command
 * still works (CRUD only) when the endpoint is missing, so we degrade to an
 * empty list rather than fail.
 */
async function fetchCustomMethods(
  sidecarUrl: string,
): Promise<CustomMethodInfo[]> {
  try {
    const res = await fetch(`${sidecarUrl}/api/custom-methods`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { methods?: CustomMethodInfo[] };
    return body.methods ?? [];
  } catch {
    return [];
  }
}

/**
 * aep-lib-ts v0.0.2 only registers a create method when the collection POST
 * declares a `200` response, but aepbase returns `201` — so create is missed
 * for every resource. Re-derive it from the raw OpenAPI: a collection POST
 * means create; an `id` query param means user-settable ids.
 */
function patchCreateMethods(
  resources: Record<string, Resource>,
  openapi: OpenAPI,
): void {
  for (const resource of Object.values(resources)) {
    if (resource.createMethod) continue;
    const collectionPath = `/${resource.patternElems.slice(0, -1).join('/')}`;
    const post = openapi.paths?.[collectionPath]?.post;
    if (!post) continue;
    resource.createMethod = {
      supportsUserSettableCreate:
        post.parameters?.some((p) => p.name === 'id') ?? false,
    };
  }
}

/**
 * Resolve the app origin. Precedence: an explicit `--server-url` (tolerating a
 * trailing `/api/aep`), then the chosen profile's stored server, then loopback
 * on `--port` (default 3000).
 */
function resolveOrigin(opts: ConnectOptions, profile: Profile | undefined): string {
  if (opts.serverUrl) {
    return opts.serverUrl.replace(/\/$/, '').replace(/\/api\/aep$/, '');
  }
  if (profile) return profile.server;
  const port = opts.port ?? 3000;
  return `http://127.0.0.1:${port}`;
}

/**
 * Pick the login profile that backs this run, if any. A named `--profile` must
 * exist. Otherwise the default profile is used only when no inline auth
 * override (`--token` / `--email`+`--password`) was supplied.
 */
function resolveProfile(opts: ConnectOptions): Profile | undefined {
  if (opts.profile) {
    const found = getProfile(opts.profile);
    if (!found) {
      throw new ConnectError(
        `no such profile "${opts.profile}" — run \`homestead login --profile=${opts.profile}\` first.`,
      );
    }
    return found.profile;
  }
  if (opts.token || (opts.email && opts.password)) return undefined;
  return getProfile()?.profile;
}

/** One-shot reachability check so we fail fast with a clear message. */
async function probe(origin: string): Promise<void> {
  try {
    await fetch(`${origin}/`, { signal: AbortSignal.timeout(2_000) });
  } catch {
    throw new ConnectError(
      `no homestead server listening on ${origin} — is \`homestead start\` running? ` +
        '(override with --server-url or --port)',
    );
  }
}

/**
 * Resolve the caller's bearer token + user id. The id is needed for the
 * custom-method gateway's `X-User-Id` header. Precedence: an explicit
 * `--token` (read back via `/users/me`), then `--email`+`--password` (a fresh
 * login), then the stored login profile. With none of these, the user has to
 * run `homestead login` first — there is no local admin-token mint.
 */
async function resolveAuth(
  serverUrl: string,
  opts: ConnectOptions,
  profile: Profile | undefined,
): Promise<{ token: string; userId: string }> {
  if (opts.token) {
    return { token: opts.token, userId: await whoami(serverUrl, opts.token) };
  }
  if (opts.email && opts.password) {
    return login(serverUrl, opts.email, opts.password);
  }
  if (profile) {
    return { token: profile.token, userId: profile.userId };
  }
  throw new ConnectError(
    'not logged in — run `homestead login` (or pass --token, or --email + --password).',
  );
}

async function whoami(serverUrl: string, token: string): Promise<string> {
  const res = await fetch(`${serverUrl}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new ConnectError(`GET ${serverUrl}/users/me → ${res.status}`);
  }
  const user = (await res.json()) as { id?: string };
  if (!user.id) throw new ConnectError('aepbase /users/me response missing id');
  return user.id;
}

/** POST /users/:login → { token, user }. Captures the user id too. */
async function login(
  serverUrl: string,
  email: string,
  password: string,
): Promise<{ token: string; userId: string }> {
  const res = await fetch(`${serverUrl}/users/:login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ConnectError(`aepbase login → ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { token?: string; user?: { id?: string } };
  if (!body.token || !body.user?.id) {
    throw new ConnectError('aepbase login response missing token or user id');
  }
  return { token: body.token, userId: body.user.id };
}

async function fetchOpenApi(serverUrl: string): Promise<OpenAPI> {
  const res = await fetch(`${serverUrl}/openapi.json`);
  if (!res.ok) {
    throw new ConnectError(`GET ${serverUrl}/openapi.json → ${res.status}`);
  }
  return (await res.json()) as OpenAPI;
}
