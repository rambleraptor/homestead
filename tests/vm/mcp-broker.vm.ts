/**
 * The MCP broker (`server/mcp/broker.ts`), on the VM tier, against an
 * in-process stand-in for an outside MCP server (`vm/mcp-stub.ts`): who may
 * call which tools, the tool policies, approval for "ask first" tools, errors
 * and oversized results, and the `mcp-call` log every call leaves behind.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import {
  installMcpStub,
  MCP_STUB_HOST,
  MCP_STUB_TOKEN,
  MCP_STUB_URL,
  type McpStub,
} from '@rambleraptor/homestead-test-harness/vm/mcp-stub';
import { callConnectionTool, MAX_RESULT_CHARS } from '@rambleraptor/homestead-core/server/mcp/broker';
import type { McpCall, McpServer } from '@rambleraptor/homestead-core/superuser/mcp-servers/types';
import { McpServersPage } from '../e2e/pages/McpServersPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';

const APP = () => process.env.HOMESTEAD_E2E_APP_URL!;
const realTrusted = process.env.HOMESTEAD_MCP_TRUSTED_HOSTS;

describe('MCP broker', () => {
  let h: Harness;
  let stub: McpStub;
  let server: McpServer;

  beforeEach(async () => {
    process.env.HOMESTEAD_MCP_TRUSTED_HOSTS = MCP_STUB_HOST;
    stub = installMcpStub();
    h = await bootHomestead();
    const admin = e2eClient(h.admin.token);
    const credential = await admin.collection<{ id: string }>('credentials').create({
      name: 'Home Assistant token',
      value: MCP_STUB_TOKEN,
    });
    server = await admin.collection<McpServer>('mcp-servers').create({
      name: 'Home Assistant',
      url: MCP_STUB_URL,
      credential: `credentials/${credential.id}`,
      status: 'ok',
      tools: [
        { name: 'get_state', read_only: true, policy: 'read' },
        { name: 'turn_on', policy: 'allow' },
        { name: 'unlock', policy: 'ask' },
        { name: 'fail', policy: 'read' },
        { name: 'big', policy: 'read' },
        { name: 'reboot', policy: 'off' },
      ],
    });
  });

  afterEach(async () => {
    await h.close();
    if (realTrusted === undefined) delete process.env.HOMESTEAD_MCP_TRUSTED_HOSTS;
    else process.env.HOMESTEAD_MCP_TRUSTED_HOSTS = realTrusted;
  });

  function callTool(token: string, tool: string, args?: Record<string, unknown>): Promise<Response> {
    return fetch(`${APP()}/api/aep/mcp-servers/${server.id}:call-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tool, ...(args ? { arguments: args } : {}) }),
    });
  }

  const errorOf = async (res: Response) => ((await res.json()) as { error: { message: string } }).error.message;
  const calls = () =>
    e2eClient(h.admin.token).collection<McpCall>('mcp-calls').listAll({ orderBy: 'create_time' });

  function shareWith(capability: 'read' | 'write') {
    return e2eClient(h.admin.token).collection('access-grants').create({
      subject_type: 'group',
      subject_id: 'members',
      target_scope: 'record',
      resource_type: 'mcp-server',
      resource_id: server.id,
      capability,
      effect: 'allow',
    });
  }

  test('a call runs with the server’s token, returns untrusted data, and is logged', async () => {
    const res = await callTool(h.admin.token, 'get_state', { entity: 'light.kitchen' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      untrusted: true,
      source: 'Home Assistant (MCP server)',
      tool: 'get_state',
      content: 'light.kitchen is off',
      truncated: false,
    });
    expect(stub.calls).toEqual([{ tool: 'get_state', arguments: { entity: 'light.kitchen' } }]);

    const [logged] = await calls();
    expect(logged).toMatchObject({
      server: `mcp-servers/${server.id}`,
      server_name: 'Home Assistant',
      tool: 'get_state',
      caller: `users/${h.admin.id}`,
      arguments: '{"entity":"light.kitchen"}',
      outcome: 'ok',
    });
    expect(logged!.duration_ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(await calls())).not.toContain(MCP_STUB_TOKEN);
  });

  test('a tool that’s off, or unknown, never reaches the server', async () => {
    for (const tool of ['reboot', 'self_destruct']) {
      const res = await callTool(h.admin.token, tool);
      expect(res.status).toBe(403);
      expect(await errorOf(res)).toContain("isn't turned on");
    }
    expect(stub.calls).toEqual([]);
    expect((await calls()).map((c) => [c.tool, c.outcome])).toEqual([
      ['reboot', 'refused'],
      ['self_destruct', 'refused'],
    ]);
  });

  test('an "ask first" tool runs only once the person approved it', async () => {
    const asked = await callConnectionTool({
      server: server.id,
      tool: 'unlock',
      args: { entity: 'lock.front' },
      caller: { token: h.admin.token, userId: h.admin.id },
      conversation: 'conversations/c1',
    });
    expect(asked).toEqual({ outcome: 'refused', error: '"unlock" on Home Assistant needs the person\'s approval first' });
    expect(stub.calls).toEqual([]);
    expect((await calls())[0]).toMatchObject({ tool: 'unlock', outcome: 'refused', conversation: 'conversations/c1' });

    // Calling it yourself is the approval.
    expect((await callTool(h.admin.token, 'unlock', { entity: 'lock.front' })).status).toBe(200);
    expect(stub.calls.map((c) => c.tool)).toEqual(['unlock']);
  });

  test('a member can use nothing until the server is shared with them', async () => {
    const res = await callTool(h.member.token, 'get_state', { entity: 'light.kitchen' });
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe(`no MCP server "${server.id}" is shared with you`);
    // The same answer as a server that doesn't exist.
    const missing = await callConnectionTool({
      server: 'nope',
      tool: 'get_state',
      caller: { token: h.member.token, userId: h.member.id },
    });
    expect(missing).toEqual({ outcome: 'refused', error: 'no MCP server "nope" is shared with you' });
    expect(stub.calls).toEqual([]);
    // The attempt on the real server is logged; the made-up id isn't.
    expect((await calls()).map((c) => [c.server, c.caller, c.outcome])).toEqual([
      [`mcp-servers/${server.id}`, `users/${h.member.id}`, 'refused'],
    ]);
  });

  test('View lets a member use the "use freely" tools only', async () => {
    await shareWith('read');
    expect((await callTool(h.member.token, 'get_state', { entity: 'light.kitchen' })).status).toBe(200);
    const write = await callTool(h.member.token, 'turn_on', { entity: 'light.kitchen' });
    expect(write.status).toBe(403);
    expect(await errorOf(write)).toContain('to look things up only');
    expect(stub.calls.map((c) => c.tool)).toEqual(['get_state']);
  });

  test('Can edit lets a member use every tool that’s on — but not change the server', async () => {
    await shareWith('write');
    expect((await callTool(h.member.token, 'turn_on', { entity: 'light.kitchen' })).status).toBe(200);
    expect(stub.calls.map((c) => c.tool)).toEqual(['turn_on']);
    await expect(
      e2eClient(h.member.token).collection('mcp-servers').record(server.id).update({ name: 'Mine now' }),
    ).rejects.toMatchObject({ code: 403 });
  });

  test('a tool’s own error, and an oversized result', async () => {
    const failed = await callTool(h.admin.token, 'fail');
    expect(failed.status).toBe(502);
    expect(await errorOf(failed)).toBe('the device is unreachable');

    const big = (await (await callTool(h.admin.token, 'big', { size: MAX_RESULT_CHARS + 500 })).json()) as {
      content: string;
      truncated: boolean;
    };
    expect(big.truncated).toBe(true);
    expect(big.content).toHaveLength(MAX_RESULT_CHARS);
    expect((await calls()).map((c) => [c.tool, c.outcome, c.error ?? undefined])).toEqual([
      ['fail', 'error', 'the device is unreachable'],
      ['big', 'ok', undefined],
    ]);
  });

  test('only superusers can read the log', async () => {
    await shareWith('write');
    await callTool(h.member.token, 'get_state', { entity: 'light.kitchen' });
    expect(await calls()).toHaveLength(1);
    expect(await e2eClient(h.member.token).collection('mcp-calls').listAll()).toEqual([]);
  });

  test('the server’s card shows its recent calls', async () => {
    await shareWith('read');
    await callTool(h.member.token, 'get_state', { entity: 'light.kitchen' });
    await callTool(h.admin.token, 'reboot');
    const [ok, refused] = await calls();

    await h.loginAs(h.admin);
    const page = new McpServersPage(h.driver);
    await page.goto();
    await page.openCalls(server.id);
    await h.driver.expect(page.call(ok!.id)).toContainText('get_state');
    await h.driver.expect(page.call(ok!.id)).toContainText('OK');
    await h.driver.expect(page.call(refused!.id)).toContainText('Not allowed');
    await h.driver.expect(page.call(refused!.id)).toContainText('isn\'t turned on');
  });
});
