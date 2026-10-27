/**
 * MCP servers Page Object Model.
 *
 * Covers the superuser-only MCP servers app (`/superuser/mcp-servers`): add a
 * server, check it for tools, and set each tool's policy.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class McpServersPage {
  constructor(readonly driver: Driver) {}

  async goto() {
    await this.driver.goto('/superuser/mcp-servers');
  }

  get emptyState(): Locator {
    return this.driver.getByTestId('mcp-servers-empty');
  }

  server(id: string): Locator {
    return this.driver.getByTestId(`mcp-server-${id}`);
  }

  status(id: string): Locator {
    return this.driver.getByTestId(`mcp-server-status-${id}`);
  }

  error(id: string): Locator {
    return this.driver.getByTestId(`mcp-server-error-${id}`);
  }

  toolCount(id: string): Locator {
    return this.driver.getByTestId(`mcp-server-tool-count-${id}`);
  }

  toolPolicy(id: string, tool: string): Locator {
    return this.driver.getByTestId(`mcp-tool-policy-${id}-${tool}`);
  }

  /** Add a server with no credential. */
  async add(name: string, url: string) {
    await this.driver.getByTestId('add-mcp-server-button').click();
    await this.driver.getByTestId('mcp-server-name').fill(name);
    await this.driver.getByTestId('mcp-server-url').fill(url);
    await this.driver.getByTestId('mcp-server-form-submit').click();
    await this.driver.getByTestId('mcp-server-form').waitFor({ state: 'hidden' });
  }

  async check(id: string) {
    await this.driver.getByTestId(`check-mcp-server-${id}`).click();
  }

  async openTools(id: string) {
    await this.driver.getByTestId(`toggle-mcp-tools-${id}`).click();
  }

  async openCalls(id: string) {
    await this.driver.getByTestId(`toggle-mcp-calls-${id}`).click();
  }

  /** One row of a server's recent calls. */
  call(callId: string): Locator {
    return this.driver.getByTestId(`mcp-call-${callId}`);
  }

  async setPolicy(id: string, tool: string, policy: 'off' | 'read' | 'ask' | 'allow') {
    await this.toolPolicy(id, tool).selectOption(policy);
  }
}
