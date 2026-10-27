/**
 * Which addresses an MCP server may live at.
 *
 * Unlike a URL a member pastes into an import form (`./safe-fetch`, public
 * internet only), an MCP server is added by a superuser, and the household's
 * own services are the point: Home Assistant at `homeassistant.local`, a NAS,
 * something on the tailnet. So home-network addresses are allowed. What stays
 * fenced is what no household service lives at and an attacker would want:
 *
 *   - loopback — Homestead itself (its engine, its own `/api/mcp`);
 *   - link-local — including the cloud metadata service (169.254.169.254);
 *   - "this network", multicast, and reserved space.
 *
 * Every request the MCP client makes goes through {@link mcpFetch}, which
 * re-checks the address and refuses redirects, so a server can't bounce the
 * connection somewhere fenced. An operator who runs an MCP server on the same
 * box lists its host in `HOMESTEAD_MCP_TRUSTED_HOSTS` (comma-separated), which
 * skips the address check for that host only. The DNS-rebinding caveat in
 * `./safe-fetch` applies here too.
 */

import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { parseHttpUrl, UnsafeUrlError } from './safe-fetch';

export { UnsafeUrlError } from './safe-fetch';

function isAllowedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0) return false; // "this network"
  if (a === 127) return false; // loopback: Homestead itself
  if (a === 169 && b === 254) return false; // link-local, incl. cloud metadata
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true; // public, private LAN (10/8, 172.16/12, 192.168/16), CGNAT/tailnet
}

function isAllowedIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0];
  if (addr === '::' || addr === '::1') return false; // unspecified / loopback
  const mapped = addr.match(/^::(?:ffff:(?:0{1,4}:)?)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isAllowedIPv4(mapped[1]);
  const group = parseInt(addr.split(':')[0] || '0', 16);
  if ((group & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((group & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  return true; // public and fc00::/7 unique-local (home networks)
}

/** Whether an MCP server may be reached at `ip`. */
export function isAllowedMcpAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isAllowedIPv4(ip);
  if (version === 6) return isAllowedIPv6(ip.replace(/^\[|\]$/g, ''));
  return false;
}

/** Hosts (`name` or `name:port`) an operator trusts outright: `HOMESTEAD_MCP_TRUSTED_HOSTS`. */
export function trustedMcpHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.HOMESTEAD_MCP_TRUSTED_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Parse an MCP server URL and check where it points. Throws
 * {@link UnsafeUrlError} with a message fit to show the superuser.
 */
export async function assertMcpUrl(input: string, trusted = trustedMcpHosts()): Promise<URL> {
  const url = parseHttpUrl(input);
  const host = url.hostname.toLowerCase();
  if (trusted.has(host) || trusted.has(url.host.toLowerCase())) return url;

  const literal = host.replace(/^\[|\]$/g, '');
  if (isIP(literal)) {
    if (!isAllowedMcpAddress(literal)) {
      throw new UnsafeUrlError(`MCP servers can't be at ${literal} (loopback, link-local or reserved)`);
    }
    return url;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError(`Could not resolve ${host}`);
  }
  if (addresses.length === 0) throw new UnsafeUrlError(`Could not resolve ${host}`);
  for (const { address } of addresses) {
    if (!isAllowedMcpAddress(address)) {
      throw new UnsafeUrlError(
        `MCP servers can't be at ${host}: it resolves to ${address} (loopback, link-local or reserved)`,
      );
    }
  }
  return url;
}

/**
 * The `fetch` the MCP client uses: every request's URL is checked before it's
 * sent, and redirects are refused rather than followed.
 */
export function mcpFetch(trusted = trustedMcpHosts()): typeof fetch {
  const guarded = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = input instanceof Request ? input.url : String(input);
    await assertMcpUrl(target, trusted);
    // Read globalThis.fetch per call: the VM test tier installs its shim after import.
    return globalThis.fetch(input, { ...init, redirect: 'error' });
  };
  return guarded as typeof fetch;
}
