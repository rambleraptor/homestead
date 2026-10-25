/**
 * `/api/mcp` offers only what its caller can reach: the route narrows its
 * definitions through the installed collection-access resolver (the engine's
 * `collectionAccess` in a real server, see `test/engine/collection-access`),
 * dropping what the caller can't read and the write actions on what they
 * can't change.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AuthServerConfig } from '@rambleraptor/homestead-core/apps/config';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import type { CollectionAccess } from '@rambleraptor/homestead-core/resources/model-tools';
import { setCollectionAccessResolver } from '@rambleraptor/homestead-core/server/collection-access';
import { makeMcpRoute, mcpAudience } from '../../src/routes/mcp';
import { AuthService } from '../../src/auth/service';
import { createOAuthTables } from '../../src/auth/oauth/storage';
import { makeEngine } from '../engine/helpers';

const CFG: AuthServerConfig = {
  enabled: true,
  issuerUrl: 'https://home.example.com',
  scopesSupported: ['homestead'],
};

const DEFS: ResourceDefinition[] = [
  { singular: 'book', plural: 'books', fields: { title: { type: 'string' } } },
  { singular: 'chapter', plural: 'chapters', parents: ['book'], fields: { title: { type: 'string' } } },
  { singular: 'ledger', plural: 'ledgers', fields: { title: { type: 'string' } } },
  { singular: 'entry', plural: 'entries', parents: ['ledger'], fields: { amount: { type: 'number' } } },
];

type Tool = { name: string; inputSchema?: { properties?: { action?: { enum?: string[] } } } };

async function listTools(): Promise<{ tools: Tool[]; token: string; asked: string[] }> {
  const t = await makeEngine();
  createOAuthTables(t.engine.db);
  const token = new AuthService(t.engine.db).issueSession(t.admin.id, {
    audience: mcpAudience(CFG.issuerUrl),
  }).access_token;
  const asked: string[] = [];
  const access = new Map<string, CollectionAccess>([
    ['book', { read: true, write: false }],
    ['chapter', { read: true, write: true }],
    ['ledger', { read: false, write: false }],
    ['entry', { read: true, write: true }],
  ]);
  setCollectionAccessResolver(async (callerToken) => {
    asked.push(callerToken);
    return access;
  });

  const app = new Hono();
  app.route('/api/mcp', makeMcpRoute(t.engine, CFG, () => DEFS));
  const send = (body: unknown) =>
    app.request('/api/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  await send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  });
  const text = await (await send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })).text();
  const payload = JSON.parse(text.startsWith('data:') ? text.slice(5).trim() : text);
  return { tools: (payload.result?.tools ?? []) as Tool[], token, asked };
}

afterEach(() => setCollectionAccessResolver(null));

describe('collection access on /api/mcp', () => {
  it("drops what the caller can't read, with its children, and writes they can't make", async () => {
    const { tools, token, asked } = await listTools();
    // Resolved for the caller's own token — the access it acts with.
    expect(new Set(asked)).toEqual(new Set([token]));
    const byName = new Map(tools.map((tool) => [tool.name, tool.inputSchema?.properties?.action?.enum]));
    expect([...byName.keys()].sort()).toEqual(['books', 'chapters']);
    expect(byName.get('books')).toEqual(['list', 'get']);
    expect(byName.get('chapters')).toEqual(['list', 'get', 'create', 'update', 'delete']);
  });
});
