/**
 * Where an MCP server may live: home-network addresses yes (that's the point —
 * Home Assistant, a NAS, the tailnet), Homestead itself and the cloud metadata
 * service no; trusted hosts skip the check.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertMcpUrl, isAllowedMcpAddress, mcpFetch, trustedMcpHosts } from '../net/mcp-url';

describe('isAllowedMcpAddress', () => {
  it('allows public and home-network addresses', () => {
    for (const ip of ['8.8.8.8', '192.168.1.20', '10.0.0.5', '172.20.1.1', '100.101.102.103', 'fd12::1', '2606:4700::1111']) {
      expect(isAllowedMcpAddress(ip), ip).toBe(true);
    }
  });

  it('refuses loopback, link-local, metadata and reserved space', () => {
    for (const ip of ['127.0.0.1', '::1', '169.254.169.254', 'fe80::1', '0.0.0.0', '224.0.0.1', '::ffff:127.0.0.1', '::']) {
      expect(isAllowedMcpAddress(ip), ip).toBe(false);
    }
  });
});

describe('assertMcpUrl', () => {
  it('takes http(s) URLs at allowed literals', async () => {
    await expect(assertMcpUrl('http://192.168.1.20:8123/api/mcp', new Set())).resolves.toBeInstanceOf(URL);
  });

  it('refuses other schemes, embedded credentials and fenced addresses', async () => {
    await expect(assertMcpUrl('file:///etc/passwd', new Set())).rejects.toThrow('Only http and https');
    await expect(assertMcpUrl('http://user:pw@192.168.1.20/', new Set())).rejects.toThrow('embedded credentials');
    await expect(assertMcpUrl('http://127.0.0.1:8090/api/mcp', new Set())).rejects.toThrow('loopback');
    await expect(assertMcpUrl('http://169.254.169.254/latest', new Set())).rejects.toThrow("can't be at");
    await expect(assertMcpUrl('http://[::1]/mcp', new Set())).rejects.toThrow("can't be at");
  });

  it('skips the check for a trusted host', async () => {
    const trusted = trustedMcpHosts({ HOMESTEAD_MCP_TRUSTED_HOSTS: ' localhost:9000 , 127.0.0.1 ' });
    await expect(assertMcpUrl('http://127.0.0.1:9000/mcp', trusted)).resolves.toBeInstanceOf(URL);
    await expect(assertMcpUrl('http://localhost:9000/mcp', trusted)).resolves.toBeInstanceOf(URL);
    // Trust is per host:port when given with a port.
    await expect(assertMcpUrl('http://localhost:9001/mcp', trusted)).rejects.toThrow();
  });
});

describe('mcpFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('checks every request and refuses redirects', async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init ?? {});
      return new Response('{}');
    });
    const guarded = mcpFetch(new Set());
    await guarded('http://192.168.1.20/mcp', { method: 'POST' });
    expect(seen[0]).toMatchObject({ method: 'POST', redirect: 'error' });
    await expect(guarded('http://127.0.0.1/mcp')).rejects.toThrow('loopback');
    expect(seen).toHaveLength(1);
  });
});
