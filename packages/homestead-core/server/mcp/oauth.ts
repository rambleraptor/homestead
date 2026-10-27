/**
 * OAuth sign-in for household MCP servers.
 *
 * Many MCP servers take OAuth rather than a pasted token. `@ai-sdk/mcp` does
 * the protocol — discovering where a server signs in, registering a client
 * where the server allows it, PKCE, the code exchange and refresh — through an
 * `OAuthClientProvider`; this module is ours, keeping what it needs in an
 * `oauth`-kind `credential`:
 *
 *  - `oauth_client_id` / `oauth_client_secret` — a client a superuser
 *    registered with the provider, for servers that don't register one;
 *  - `oauth_state` (secret, server-written) — the tokens, a client the server
 *    registered for us, and the sign-in server it named;
 *  - `oauth_resource` — the server address the sign-in is for. Its tokens are
 *    attached to that address only: point the server somewhere else and it
 *    must be connected again.
 *
 * Signing in has two halves. {@link startConnect} returns the provider's
 * sign-in address, keeping the PKCE verifier and `state` in memory, single-use
 * and for ten minutes (the server is one process). The provider sends the
 * browser back to the SPA, which hands the code to {@link finishConnect} under
 * the same superuser's own session — so a code can't be planted into someone
 * else's sign-in. After that, {@link oauthProviderFor} gives a connection fresh
 * tokens, refreshing at most once at a time per credential; it never starts a
 * sign-in itself — a refresh that fails means "reconnect", said on the server.
 *
 * Every OAuth request goes through the MCP address policy (`../net/mcp-url`),
 * redirects refused. Tokens and client secrets are secrets: they never reach a
 * response, a log or a model.
 */

import { randomBytes } from 'node:crypto';
import {
  auth,
  type OAuthClientInformation,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthTokens,
} from '@ai-sdk/mcp';
import { referenceId } from '../../resources/references';
import { serverClient } from '../client';
import { readSecret } from '../secrets';
import { withSystemToken } from '../system-token';
import { assertMcpUrl, mcpFetch } from '../net/mcp-url';
import { CREDENTIALS } from '../../superuser/credentials/resources';
import type { Credential } from '../../superuser/credentials/types';

/** Where the SPA receives the provider's answer; the redirect URI's path. */
export const OAUTH_CALLBACK_PATH = '/superuser/mcp-servers/oauth-callback';
/** How long a started sign-in may take. */
const PENDING_TTL_MS = 10 * 60_000;
/** Refresh a token this long before it expires. */
const REFRESH_EARLY_MS = 60_000;

/** A sign-in failed, or a connection needs one; said to a superuser. Never carries a token. */
export class OAuthConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthConnectionError';
  }
}

/** What `oauth_state` holds. Written by the server only. */
interface StoredOAuthState {
  tokens?: OAuthTokens & { obtained_at?: number };
  /** A client the sign-in server registered for us (dynamic registration). */
  client?: OAuthClientInformation & { redirect_uris?: string[] };
  /** The sign-in server and its token endpoint, as discovered. */
  server?: { authorizationServerUrl: string; tokenEndpoint: string };
}

/** The OAuth parts of a credential, as server code sees them. */
interface OAuthCredential {
  id: string;
  kind?: string;
  clientId?: string;
  scope?: string;
  resource?: string;
}

const credentialPath = (id: string) => `${CREDENTIALS}/${id}`;

function readState(credentialId: string): StoredOAuthState {
  const value = readSecret('credential', credentialPath(credentialId), 'oauth_state');
  return value && typeof value === 'object' ? (value as StoredOAuthState) : {};
}

function readClientSecret(credentialId: string): string | undefined {
  const value = readSecret('credential', credentialPath(credentialId), 'oauth_client_secret');
  return typeof value === 'string' && value ? value : undefined;
}

/** Write fields of a credential as the system: the caller may be a member's turn refreshing tokens. */
async function writeCredential(credentialId: string, fields: Record<string, unknown>): Promise<void> {
  await withSystemToken((token) => serverClient(token).collection(CREDENTIALS).record(credentialId).update(fields));
}

async function writeState(credentialId: string, update: (state: StoredOAuthState) => StoredOAuthState) {
  await writeCredential(credentialId, { oauth_state: update(readState(credentialId)) });
}

/** A credential's OAuth parts — descriptors only, read as the system. */
export async function loadOAuthCredential(reference: string): Promise<OAuthCredential | null> {
  const id = referenceId(reference, CREDENTIALS);
  try {
    const record = await withSystemToken((token) =>
      serverClient(token).collection<Credential>(CREDENTIALS).get(id),
    );
    return {
      id,
      kind: record.kind,
      clientId: record.oauth_client_id || undefined,
      scope: record.oauth_scope || undefined,
      resource: record.oauth_resource || undefined,
    };
  } catch {
    return null;
  }
}

/** What a provider does when the protocol wants the person to sign in. */
type SignInMode =
  | { kind: 'connect'; capture: (url: URL) => void }
  // A connection in use never starts a sign-in: it fails, and asks for a reconnect.
  | { kind: 'use' };

interface ProviderOptions {
  credential: OAuthCredential;
  redirectUri: string;
  mode: SignInMode;
  /** The finishing half: the verifier and state saved when the sign-in started. */
  pending?: { codeVerifier: string; state: string };
}

/** The `@ai-sdk/mcp` provider backed by a credential. */
function credentialProvider({ credential, redirectUri, mode, pending }: ProviderOptions): OAuthClientProvider & {
  started: { codeVerifier?: string; state?: string };
} {
  const id = credential.id;
  const started: { codeVerifier?: string; state?: string } = {};
  const clientMetadata: OAuthClientMetadata = {
    redirect_uris: [redirectUri],
    client_name: 'Homestead',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    ...(credential.scope ? { scope: credential.scope } : {}),
  };
  return {
    started,
    get redirectUrl() {
      return redirectUri;
    },
    get clientMetadata() {
      return clientMetadata;
    },
    clientInformation() {
      if (credential.clientId) {
        const secret = readClientSecret(id);
        return { client_id: credential.clientId, ...(secret ? { client_secret: secret } : {}) };
      }
      const registered = readState(id).client;
      // A client registered for another address can't receive a new sign-in: register again.
      if (mode.kind === 'connect' && registered?.redirect_uris && !registered.redirect_uris.includes(redirectUri)) {
        return undefined;
      }
      return registered;
    },
    async saveClientInformation(info: OAuthClientInformation) {
      // Only a client the server registered for us; a pasted one stays as typed.
      if (credential.clientId) return;
      await writeState(id, (state) => ({ ...state, client: { ...info, redirect_uris: [redirectUri] } }));
    },
    authorizationServerInformation() {
      return readState(id).server;
    },
    async saveAuthorizationServerInformation(server) {
      await writeState(id, (state) => ({ ...state, server }));
    },
    tokens() {
      return readState(id).tokens;
    },
    async saveTokens(tokens: OAuthTokens) {
      await writeState(id, (state) => ({ ...state, tokens: { ...tokens, obtained_at: Date.now() } }));
    },
    async invalidateCredentials(scope) {
      await writeState(id, (state) => {
        if (scope === 'all') return {};
        if (scope === 'tokens') return { ...state, tokens: undefined };
        if (scope === 'client') return { ...state, client: undefined };
        return state;
      });
    },
    redirectToAuthorization(url: URL) {
      if (mode.kind === 'use') {
        throw new OAuthConnectionError('its sign-in has expired or was revoked — reconnect it');
      }
      mode.capture(url);
    },
    saveCodeVerifier(verifier: string) {
      started.codeVerifier = verifier;
    },
    codeVerifier() {
      const verifier = pending?.codeVerifier ?? started.codeVerifier;
      if (!verifier) throw new OAuthConnectionError('no sign-in is in progress');
      return verifier;
    },
    state() {
      return randomBytes(32).toString('base64url');
    },
    saveState(state: string) {
      started.state = state;
    },
    storedState() {
      return pending?.state ?? started.state;
    },
    async validateAuthorizationServerURL(_serverUrl, authorizationServerUrl) {
      await assertMcpUrl(String(authorizationServerUrl));
    },
  };
}

interface PendingSignIn {
  credentialId: string;
  serverId: string;
  serverUrl: string;
  userId: string;
  redirectUri: string;
  codeVerifier: string;
  expiresAt: number;
}

/** Started sign-ins, by `state`. In memory: the server is one process. */
const pendingSignIns = new Map<string, PendingSignIn>();

function sweepPending(now = Date.now()) {
  for (const [state, entry] of pendingSignIns) if (entry.expiresAt <= now) pendingSignIns.delete(state);
}

/** A redirect URI the SPA may ask for: http(s), on the callback page, nothing more. */
export function checkRedirectUri(input: unknown): string {
  if (typeof input !== 'string') throw new OAuthConnectionError('a redirect_uri is required');
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new OAuthConnectionError('redirect_uri is not a URL');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.pathname !== OAUTH_CALLBACK_PATH) {
    throw new OAuthConnectionError(`redirect_uri must be this Homestead's ${OAUTH_CALLBACK_PATH}`);
  }
  if (url.search || url.hash || url.username || url.password) {
    throw new OAuthConnectionError('redirect_uri must be a plain address');
  }
  return url.toString();
}

/**
 * Start signing in `credential` to the server at `serverUrl`: the provider's
 * sign-in address to send the browser to. Any tokens already held are dropped
 * — connecting means a fresh sign-in.
 */
export async function startConnect(input: {
  credential: OAuthCredential;
  serverId: string;
  serverUrl: string;
  userId: string;
  redirectUri: string;
}): Promise<{ authorizationUrl: string }> {
  sweepPending();
  await assertMcpUrl(input.serverUrl);
  await writeState(input.credential.id, (state) => ({ ...state, tokens: undefined }));
  let captured: URL | undefined;
  const provider = credentialProvider({
    credential: input.credential,
    redirectUri: input.redirectUri,
    mode: { kind: 'connect', capture: (url) => (captured = url) },
  });
  const result = await auth(provider, {
    serverUrl: input.serverUrl,
    ...(input.credential.scope ? { scope: input.credential.scope } : {}),
    fetchFn: mcpFetch(),
  });
  if (result !== 'REDIRECT' || !captured || !provider.started.state || !provider.started.codeVerifier) {
    throw new OAuthConnectionError('the server didn’t ask for a sign-in');
  }
  pendingSignIns.set(provider.started.state, {
    credentialId: input.credential.id,
    serverId: input.serverId,
    serverUrl: input.serverUrl,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeVerifier: provider.started.codeVerifier,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
  return { authorizationUrl: captured.toString() };
}

/**
 * Finish a sign-in with the code the provider sent back. The `state` must be
 * one this server started, unexpired, for the same superuser and server; it's
 * used once either way.
 */
export async function finishConnect(input: {
  serverId: string;
  userId: string;
  state: string;
  code: string;
}): Promise<{ credentialId: string; serverUrl: string }> {
  sweepPending();
  const pending = pendingSignIns.get(input.state);
  pendingSignIns.delete(input.state);
  if (!pending || pending.serverId !== input.serverId || pending.userId !== input.userId) {
    throw new OAuthConnectionError('this sign-in wasn’t started here, or it expired — connect again');
  }
  const credential = await loadOAuthCredential(pending.credentialId);
  if (!credential) throw new OAuthConnectionError('the credential for this sign-in is gone');
  const provider = credentialProvider({
    credential,
    redirectUri: pending.redirectUri,
    mode: { kind: 'use' },
    pending: { codeVerifier: pending.codeVerifier, state: input.state },
  });
  await auth(provider, {
    serverUrl: pending.serverUrl,
    authorizationCode: input.code,
    callbackState: input.state,
    fetchFn: mcpFetch(),
  });
  await writeCredential(pending.credentialId, {
    oauth_resource: pending.serverUrl,
    oauth_connected_at: new Date().toISOString(),
  });
  return { credentialId: pending.credentialId, serverUrl: pending.serverUrl };
}

/** Forget a sign-in: its tokens go; a pasted client stays. */
export async function disconnect(credentialId: string): Promise<void> {
  await writeCredential(credentialId, { oauth_state: null, oauth_connected_at: null, oauth_resource: null });
}

/** One refresh at a time per credential, so a rotated refresh token is never spent twice. */
const refreshing = new Map<string, Promise<void>>();

function expired(tokens: StoredOAuthState['tokens'], now = Date.now()): boolean {
  if (!tokens?.expires_in || !tokens.obtained_at) return false;
  return tokens.obtained_at + tokens.expires_in * 1000 - REFRESH_EARLY_MS <= now;
}

/**
 * The provider a connection to `serverUrl` uses with an `oauth` credential:
 * its tokens, refreshed first when they're about to expire. Throws when the
 * credential was never connected, or was connected to another address.
 */
export async function oauthProviderFor(credential: OAuthCredential, serverUrl: string): Promise<OAuthClientProvider> {
  if (!credential.resource || !readState(credential.id).tokens) {
    throw new OAuthConnectionError('it isn’t connected yet — connect it');
  }
  if (credential.resource !== serverUrl) {
    throw new OAuthConnectionError('its address changed since it was connected — reconnect it');
  }
  // The redirect URI only matters to a sign-in, which a connection in use never starts.
  const redirectUri = readState(credential.id).client?.redirect_uris?.[0] ?? serverUrl;
  const provider = credentialProvider({ credential, redirectUri, mode: { kind: 'use' } });
  if (expired(readState(credential.id).tokens)) {
    let running = refreshing.get(credential.id);
    if (!running) {
      running = auth(provider, { serverUrl, fetchFn: mcpFetch() })
        .then(() => undefined)
        .finally(() => refreshing.delete(credential.id));
      refreshing.set(credential.id, running);
    }
    try {
      await running;
    } catch (err) {
      if (err instanceof OAuthConnectionError) throw err;
      throw new OAuthConnectionError('its sign-in couldn’t be refreshed — reconnect it');
    }
  }
  return provider;
}

/** For tests: forget every started sign-in. */
export function resetPendingSignInsForTests(): void {
  pendingSignIns.clear();
  refreshing.clear();
}
