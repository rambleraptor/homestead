/**
 * The assistant using a household MCP server (`server/chat/mcp-tools.ts`), on
 * the VM tier, against the in-process stub server (`vm/mcp-stub.ts`) and
 * scripted turns: which tools a share offers, a result framed as untrusted
 * data, an "ask first" tool waiting on the approval card, a failing tool, and
 * the log each call leaves.
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
import type { McpCall, McpServer } from '@rambleraptor/homestead-core/superuser/mcp-servers/types';
import type { McpTool } from '@rambleraptor/homestead-core/superuser/mcp-servers/tools';
import { ChatPage } from '../e2e/pages/ChatPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';
import { CHAT_MARKERS, MCP_TEST_SERVER_ID } from '../e2e/config/ai-scripts';

const APP = () => process.env.HOMESTEAD_E2E_APP_URL!;
const realTrusted = process.env.HOMESTEAD_MCP_TRUSTED_HOSTS;

const entity = { type: 'object', properties: { entity: { type: 'string' } }, required: ['entity'] };
const TOOLS: McpTool[] = [
  { name: 'get_state', title: 'Get state', read_only: true, policy: 'read', input_schema: entity },
  { name: 'unlock', title: 'Unlock a door', policy: 'ask', input_schema: entity },
  { name: 'turn_on', policy: 'allow', input_schema: entity },
  { name: 'fail', policy: 'read', input_schema: { type: 'object', properties: {} } },
  // Checked before schemas were stored: not offered until the next check.
  { name: 'big', policy: 'read' },
  { name: 'reboot', policy: 'off', input_schema: { type: 'object' } },
];

describe('The assistant and MCP servers', () => {
  let h: Harness;
  let stub: McpStub;

  beforeEach(async () => {
    process.env.HOMESTEAD_MCP_TRUSTED_HOSTS = MCP_STUB_HOST;
    stub = installMcpStub();
    h = await bootHomestead();
    const admin = e2eClient(h.admin.token);
    const credential = await admin.collection<{ id: string }>('credentials').create({
      name: 'Home Assistant token',
      value: MCP_STUB_TOKEN,
    });
    await admin.collection<McpServer>('mcp-servers').create(
      {
        name: 'Home Assistant',
        url: MCP_STUB_URL,
        credential: `credentials/${credential.id}`,
        status: 'ok',
        tools: TOOLS,
      },
      { id: MCP_TEST_SERVER_ID },
    );
  });

  afterEach(async () => {
    await h.close();
    if (realTrusted === undefined) delete process.env.HOMESTEAD_MCP_TRUSTED_HOSTS;
    else process.env.HOMESTEAD_MCP_TRUSTED_HOSTS = realTrusted;
  });

  function shareWith(capability: 'read' | 'write') {
    return e2eClient(h.admin.token).collection('access-grants').create({
      subject_type: 'group',
      subject_id: 'members',
      target_scope: 'record',
      resource_type: 'mcp-server',
      resource_id: MCP_TEST_SERVER_ID,
      capability,
      effect: 'allow',
    });
  }

  const calls = () =>
    e2eClient(h.admin.token).collection<McpCall>('mcp-calls').listAll({ orderBy: 'create_time' });

  let messageCounter = 0;

  /** Send a chat message as the member through the API; the reply's text, read to the end. */
  async function sendAsMember(text: string, conversationId?: string): Promise<string> {
    const res = await fetch(`${APP()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${h.member.token}` },
      body: JSON.stringify({
        ...(conversationId ? { conversation_id: conversationId } : {}),
        message: { id: `mcp-spec-${messageCounter++}`, text },
      }),
    });
    expect(res.status).toBe(200);
    return (await res.text())
      .split('\n\n')
      .map((frame) => frame.replace(/^data: /, '').trim())
      .filter((data) => data && data !== '[DONE]')
      .map((data) => JSON.parse(data) as { type: string; delta?: string })
      .filter((event) => event.type === 'text-delta')
      .map((event) => event.delta)
      .join('');
  }

  /** The MCP tools a member's turn is offered, by name. */
  async function offeredToMember(): Promise<string[]> {
    const text = await sendAsMember(`What can you do? ${CHAT_MARKERS.listTools}`);
    return text
      .split(' | ')
      .filter((tool) => tool.startsWith('mcp_'))
      .sort();
  }

  test('nothing is offered until the server is shared', async () => {
    expect(await offeredToMember()).toEqual([]);
  });

  test('View offers the "use freely" tools that have a reviewed schema', async () => {
    await shareWith('read');
    expect(await offeredToMember()).toEqual(['mcp_ha__fail', 'mcp_ha__get_state']);
  });

  test('Can edit offers the "ask first" and "allow" tools too', async () => {
    await shareWith('write');
    expect(await offeredToMember()).toEqual([
      'mcp_ha__fail',
      'mcp_ha__get_state',
      'mcp_ha__turn_on',
      'mcp_ha__unlock',
    ]);
  });

  test('a result reaches the model as untrusted outside data, and the call is logged', async () => {
    await shareWith('read');
    await h.loginAs(h.member);
    const chat = new ChatPage(h.driver);
    await chat.goto();
    await chat.send(`Is the kitchen light on? ${CHAT_MARKERS.mcpCheckLight}`);
    await h.driver.expect(chat.messages).toContainText('light.kitchen is off');
    await h.driver.expect(chat.messages).toContainText('"untrusted":true');
    await h.driver.expect(chat.messages).toContainText('Home Assistant (MCP server)');
    await h.driver.expect(chat.toolCalls.first()).toContainText('Home Assistant · Get state');
    expect(stub.calls).toEqual([{ tool: 'get_state', arguments: { entity: 'light.kitchen' } }]);

    const [logged] = await calls();
    expect(logged).toMatchObject({ tool: 'get_state', outcome: 'ok', caller: `users/${h.member.id}` });
    expect(logged!.conversation).toMatch(/^conversations\//);
  });

  test('a failing tool is reported, and the reply carries on', async () => {
    await shareWith('read');
    await h.loginAs(h.member);
    const chat = new ChatPage(h.driver);
    await chat.goto();
    await chat.send(`Try it ${CHAT_MARKERS.mcpFailing}`);
    await h.driver.expect(chat.messages).toContainText('The service said:');
    await h.driver.expect(chat.messages).toContainText('the device is unreachable');
    await expect.poll(async () => (await calls()).map((c) => c.outcome)).toEqual(['error']);
  });

  describe('an "ask first" tool waits for Approve', () => {
    async function ask(): Promise<ChatPage> {
      await shareWith('write');
      await h.loginAs(h.member);
      const chat = new ChatPage(h.driver);
      await chat.goto();
      await chat.send(`Unlock the front door ${CHAT_MARKERS.mcpUnlockDoor}`);
      await h.driver.expect(chat.approvalCard).toBeVisible();
      await h.driver.expect(h.driver.getByTestId('chat-approval-action')).toHaveText('Unlock a door');
      await h.driver.expect(h.driver.getByTestId('chat-approval-service')).toHaveText('Home Assistant');
      await h.driver.expect(chat.approvalCard).toContainText('lock.front');
      expect(stub.calls).toEqual([]);
      return chat;
    }

    test('Approve runs it', async () => {
      const chat = await ask();
      await chat.answerApproval(true);
      await h.driver.expect(chat.messages).toContainText('Done.');
      expect(stub.calls).toEqual([{ tool: 'unlock', arguments: { entity: 'lock.front' } }]);
      await expect.poll(async () => (await calls()).map((c) => [c.tool, c.outcome])).toEqual([['unlock', 'ok']]);
    });

    test('Deny never reaches the server, and is logged as declined', async () => {
      const chat = await ask();
      await chat.answerApproval(false);
      await h.driver.expect(chat.messages).toContainText('Done.');
      expect(stub.calls).toEqual([]);
      await expect
        .poll(async () => (await calls()).map((c) => [c.tool, c.outcome, c.arguments]))
        .toEqual([['unlock', 'denied', '{"entity":"lock.front"}']]);
    });

    test('moving on without answering denies it too', async () => {
      await ask();
      const conversations = e2eClient(h.member.token).collection<{ id: string; status: string }>('conversations');
      // The turn that asked has ended once its conversation is idle again.
      await expect.poll(async () => (await conversations.listAll()).map((c) => c.status)).toEqual(['idle']);
      const [conversation] = await conversations.listAll();
      expect(await sendAsMember(`Never mind ${CHAT_MARKERS.hello}`, conversation!.id)).toContain(
        'Hello from the scripted assistant',
      );
      expect(stub.calls).toEqual([]);
      await expect
        .poll(async () => (await calls()).map((c) => [c.tool, c.outcome, c.error]))
        .toEqual([['unlock', 'denied', 'not answered before the next message']]);
    });
  });

  test('checking a server stores each tool’s schema', async () => {
    const res = await fetch(`${APP()}/api/aep/mcp-servers/${MCP_TEST_SERVER_ID}:refresh-tools`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${h.admin.token}` },
    });
    expect(res.status).toBe(200);
    const server = (await res.json()) as McpServer;
    const getState = server.tools?.find((t) => t.name === 'get_state');
    expect(getState).toMatchObject({ policy: 'read' });
    expect(getState?.input_schema).toMatchObject({
      type: 'object',
      properties: { entity: { type: 'string' } },
    });
    // A tool checked before schemas were stored gets one now.
    expect(server.tools?.find((t) => t.name === 'big')?.input_schema).toMatchObject({ type: 'object' });
  });
});
