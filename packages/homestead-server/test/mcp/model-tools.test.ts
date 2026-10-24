/**
 * `ResourceDefinition.modelTools`: the `/api/mcp` route hands its surfaces only
 * the resources not hidden from MCP (and not under one that is), while a
 * resource hidden only from chat stays on MCP.
 */

import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AuthServerConfig } from '@rambleraptor/homestead-core/apps/config';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
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
  {
    singular: 'ledger',
    plural: 'ledgers',
    modelTools: { mcp: false },
    fields: { title: { type: 'string' } },
  },
  { singular: 'entry', plural: 'entries', parents: ['ledger'], fields: { amount: { type: 'number' } } },
  {
    singular: 'conversation',
    plural: 'conversations',
    modelTools: { chat: false },
    fields: { title: { type: 'string' } },
  },
];

async function toolNames(): Promise<string[]> {
  const t = await makeEngine();
  createOAuthTables(t.engine.db);
  const token = new AuthService(t.engine.db).issueSession(t.admin.id, {
    audience: mcpAudience(CFG.issuerUrl),
  }).access_token;
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
  return ((payload.result?.tools ?? []) as Array<{ name: string }>).map((tool) => tool.name).sort();
}

describe('modelTools on /api/mcp', () => {
  it('drops a resource hidden from MCP and its children, and keeps one hidden only from chat', async () => {
    expect(await toolNames()).toEqual(['books', 'conversations']);
  });
});
