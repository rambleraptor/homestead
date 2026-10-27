/**
 * The superuser MCP servers app, on the VM tier: add a server, check it (a
 * fenced address fails with the reason on the card), and set each tool's
 * policy. Members can't see or add servers until one is shared with them —
 * the collection has no household grant (`access: { model: 'superusers' }`).
 *
 * The connection itself (bearer token, tools/list against a real MCP server)
 * is covered by `homestead-server/test/mcp/mcp-client.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import type { McpServer } from '@rambleraptor/homestead-core/superuser/mcp-servers/types';
import { McpServersPage } from '../e2e/pages/McpServersPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';

describe('MCP servers', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
  });

  afterEach(async () => {
    await h.close();
  });

  const serversAs = (token: string) => e2eClient(token).collection<McpServer>('mcp-servers');

  test('a superuser adds a server; checking a fenced address fails with the reason', async () => {
    await h.loginAs(h.admin);
    const page = new McpServersPage(h.driver);
    await page.goto();
    await h.driver.expect(page.emptyState).toBeVisible();

    await page.add('Loopback', 'http://127.0.0.1:9/mcp');
    const [server] = await serversAs(h.admin.token).listAll();
    expect(server).toMatchObject({ name: 'Loopback', status: 'untested' });
    await h.driver.expect(page.status(server!.id)).toContainText('Not checked');

    await page.check(server!.id);
    await h.driver.expect(page.status(server!.id)).toContainText('Failing');
    await h.driver.expect(page.error(server!.id)).toContainText('loopback');
    expect(await serversAs(h.admin.token).get(server!.id)).toMatchObject({ status: 'failing' });
  });

  test('a superuser turns a tool on; the policy is saved', async () => {
    const created = await serversAs(h.admin.token).create({
      name: 'Home Assistant',
      url: 'http://192.168.1.20:8123/api/mcp',
      status: 'ok',
      tools: [
        { name: 'get_state', description: 'Read a device’s state', read_only: true, policy: 'off' },
        { name: 'turn_on', description: 'Turn a device on', policy: 'off' },
      ],
    });
    await h.loginAs(h.admin);
    const page = new McpServersPage(h.driver);
    await page.goto();
    await h.driver.expect(page.toolCount(created.id)).toContainText('0 of 2 tools on');

    await page.openTools(created.id);
    await page.setPolicy(created.id, 'turn_on', 'ask');
    await h.driver.expect(page.toolCount(created.id)).toContainText('1 of 2 tools on');
    const saved = await serversAs(h.admin.token).get(created.id);
    expect(saved.tools?.find((tool) => tool.name === 'turn_on')?.policy).toBe('ask');
    expect(saved.tools?.find((tool) => tool.name === 'get_state')?.policy).toBe('off');
  });

  test('sharing a server with a group lets its members see it, but not change it', async () => {
    const created = await serversAs(h.admin.token).create({
      name: 'Home Assistant',
      url: 'http://192.168.1.20:8123/api/mcp',
    });
    const asMember = serversAs(h.member.token);
    expect(await asMember.listAll()).toEqual([]);

    // What the Share dialog writes: a record grant to the Members group.
    await e2eClient(h.admin.token).collection('access-grants').create({
      subject_type: 'group',
      subject_id: 'members',
      target_scope: 'record',
      resource_type: 'mcp-server',
      resource_id: created.id,
      capability: 'read',
      effect: 'allow',
    });
    expect((await asMember.listAll()).map((server) => server.name)).toEqual(['Home Assistant']);
    await expect(asMember.record(created.id).update({ name: 'Mine now' })).rejects.toMatchObject({ code: 403 });
  });

  test('members can neither see nor add servers that weren’t shared with them', async () => {
    await serversAs(h.admin.token).create({ name: 'Home Assistant', url: 'http://192.168.1.20:8123/api/mcp' });
    const asMember = serversAs(h.member.token);
    expect(await asMember.listAll()).toEqual([]);
    await expect(asMember.create({ name: 'Mine', url: 'http://192.168.1.21/mcp' })).rejects.toMatchObject({
      code: 403,
    });
  });
});
