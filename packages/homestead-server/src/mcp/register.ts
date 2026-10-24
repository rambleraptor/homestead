/**
 * Registers Homestead's tools on an MCP server. This is the MCP analog of
 * `buildChatToolSet` in `core/server/chat/handler.ts`: it reuses the exact same
 * `buildTools` / `executeToolCall` / `makeSearchTool` machinery the AI chat
 * uses, so the MCP surface and the chat surface stay identical by construction.
 * On top of those it registers one tool per app-declared AEP-136 custom method
 * (see `core/server/chat/custom-methods`), so an MCP client is not limited to
 * plain CRUD; the chat reaches the same methods through the per-resource
 * surface's `:verb` actions.
 *
 * That is the `typed` surface. Two derived surfaces re-shape the same
 * operations for clients that can't hold ~167 tools — `./per-resource` (one
 * tool per resource, verb as a parameter) and `./generic` (six
 * resource-parameterized tools). Both produce the shape described in
 * `./surface`, so this module registers either through one loop and the choice
 * costs a single branch. Which one a request gets is the `settings` app's
 * `mcp_tools` flag, read by the route.
 *
 * Tools bind to a single caller's token, so this runs once per request (the
 * route builds a fresh McpServer each time), mirroring how `handleChat`
 * rebuilds tools per request.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { buildTools } from '@rambleraptor/homestead-core/server/chat/tools';
import { executeToolCall } from '@rambleraptor/homestead-core/server/chat/execute';
import {
  makeSearchTool,
  SEARCH_TOOL_NAME,
} from '@rambleraptor/homestead-core/server/chat/search-tool';
import { buildCustomMethodTools, executeCustomMethod } from '@rambleraptor/homestead-core/server/chat/custom-methods';
import { buildGenericTools } from './generic';
import { buildResourceTools } from '@rambleraptor/homestead-core/server/chat/per-resource';
import type { McpToolMode, ToolSurface } from '@rambleraptor/homestead-core/server/chat/surface';

function ok(result: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result ?? null) }] };
}

function err(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Options controlling which tools are exposed. */
export interface RegisterOptions {
  /**
   * Expose the write tools (create/update/delete). When false, only the
   * read tools and document search are registered. Defaults to true.
   */
  write?: boolean;
  /**
   * Which surface to register (see `./surface`):
   *  - `resource` — one tool per resource, the verb as an `action` parameter.
   *  - `typed` — four tools per resource plus one per custom method. Richest
   *    provider-side schemas, but ~167 tools on a stock instance.
   *  - `generic` — six resource-parameterized tools, so the tool count stays
   *    flat as apps are added.
   *
   * Defaults to `typed` — the surface this function registers directly, with no
   * surface object involved. That is *not* the instance default: which surface a
   * real request gets is the `settings` app's `mcp_tools` flag, which the route
   * resolves (to `resource` when unset) and passes in.
   */
  mode?: McpToolMode;
  /**
   * A surface already built for this request. The route builds one ahead of
   * registration because the MCP server needs its `instructions` at
   * construction time; passing it here avoids building it twice. Ignored when
   * `mode` is `typed`, which registers straight from `buildTools`.
   */
  surface?: ToolSurface;
}

/**
 * Register the tool surface named by `opts.mode` on `server`, plus the semantic
 * `search_documents` tool (only when embeddings are configured) — all executing
 * against aepbase under `token`, so every action runs with exactly the calling
 * user's permissions.
 *
 * On the `typed` surface that means the CRUD tools (one set per resource) and
 * one tool per declared AEP-136 custom method; the derived surfaces register
 * whatever they built.
 *
 * When `opts.write` is false, a read-only authorization can't mutate data:
 * `typed` omits the create/update/delete tools and the non-`GET` custom
 * methods, `generic` omits its write tools, and `resource` — where the tool is
 * the resource and so can't be withheld — narrows each tool's `action` enum to
 * the read actions and rejects a write outright.
 */
export function registerHomesteadTools(
  server: McpServer,
  defs: ResourceDefinition[],
  token: string,
  opts: RegisterOptions = {},
): void {
  const write = opts.write ?? true;
  const mode = opts.mode ?? 'typed';
  if (mode !== 'typed') {
    registerSurface(server, opts.surface ?? buildSurface(defs, mode, write), token);
    registerSearchTool(server, defs, token);
    return;
  }

  const { tools, bindings } = buildTools(defs);

  for (const [name, spec] of Object.entries(tools)) {
    // Read-only authorizations get only the `read` tools; skip the writers.
    if (!write && bindings.get(name)?.op !== 'read') continue;
    // buildTools always produces a z.object; the SDK accepts its raw shape as a
    // ZodRawShapeCompat and does its own JSON-Schema conversion + validation.
    const shape = (spec.inputSchema as z.ZodObject).shape;
    server.registerTool(
      name,
      { description: spec.description, inputSchema: shape },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        const out = await executeToolCall({ name, args }, bindings, token);
        return out.ok ? ok(out.result) : err(out.error ?? 'error');
      },
    );
  }

  // Custom methods come after CRUD so the generated names are reserved (a
  // custom verb that would collide with `read_book` or `search_documents` is
  // skipped, not registered twice — a duplicate name throws in the SDK). The
  // CRUD names are reserved whether or not they were registered, so a
  // read-only surface never repurposes a name that means something else on a
  // read-write one.
  const custom = buildCustomMethodTools(
    defs,
    new Set([...Object.keys(tools), SEARCH_TOOL_NAME]),
  );
  for (const [name, spec] of Object.entries(custom.tools)) {
    // Custom methods have side effects unless they're declared `GET`, so they
    // count as writes for a read-only authorization.
    if (!write && custom.bindings.get(name)?.httpMethod !== 'GET') continue;
    const shape = (spec.inputSchema as z.ZodObject).shape;
    server.registerTool(
      name,
      { description: spec.description, inputSchema: shape },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        const out = await executeCustomMethod(name, args, custom.bindings, token);
        return out.ok ? ok(out.result) : err(out.error);
      },
    );
  }

  registerSearchTool(server, defs, token);
}

/**
 * Build a derived surface. Exported because the route needs the surface's
 * `instructions` before it can construct the MCP server, and then hands the
 * same object back to {@link registerHomesteadTools}.
 */
export function buildSurface(
  defs: ResourceDefinition[],
  mode: Exclude<McpToolMode, 'typed'>,
  write: boolean,
): ToolSurface {
  return mode === 'generic'
    ? buildGenericTools(defs, { write })
    : buildResourceTools(defs, { write });
}

/**
 * Register a derived surface's tools. Both derived surfaces expose the same
 * `{ tools, execute }` shape, so registration is one loop rather than one per
 * surface — the difference between them is entirely in what they built.
 */
function registerSurface(server: McpServer, surface: ToolSurface, token: string): void {
  const { tools, execute } = surface;
  for (const [name, spec] of Object.entries(tools)) {
    const shape = (spec.inputSchema as z.ZodObject).shape;
    server.registerTool(
      name,
      { description: spec.description, inputSchema: shape },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        const out = await execute(name, args, token);
        return out.ok ? ok(out.result) : err(out.error);
      },
    );
  }
}

/** The semantic document search, registered only when embeddings are configured. */
function registerSearchTool(
  server: McpServer,
  defs: ResourceDefinition[],
  token: string,
): void {
  const search = makeSearchTool({ defs, token, record: () => {} });
  if (!search) return;
  const shape = (search.inputSchema as z.ZodObject).shape;
  const description =
    typeof search.description === 'string' ? search.description : 'Search uploaded documents.';
  const execute = search.execute!;
  server.registerTool(
    SEARCH_TOOL_NAME,
    { description, inputSchema: shape },
    async (args: Record<string, unknown>): Promise<CallToolResult> => {
      // The tool's execute takes (args, options); our impl ignores options,
      // so a minimal stub cast to the SDK's option type is safe.
      const options = { toolCallId: 'mcp', messages: [] } as unknown as Parameters<
        typeof execute
      >[1];
      const result = await execute(args as Parameters<typeof execute>[0], options);
      return ok(result);
    },
  );
}
