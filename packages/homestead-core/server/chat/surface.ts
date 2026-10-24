/**
 * The contract the non-typed tool surfaces share.
 *
 * Homestead's resources reach a model three ways (see
 * `packages/homestead-site/docs/design/mcp-tool-surfaces.md`):
 *
 *  - `typed`    — four tools per resource plus one per custom method. Richest
 *                 provider-side schemas, ~167 tools on a stock instance.
 *  - `resource` — one tool per resource, the verb as an `action` parameter
 *                 (`./per-resource`). ~41 tools, each carrying its own
 *                 resource's real field schema, emitted once instead of twice.
 *                 What the AI chat uses, and the `/api/mcp` default.
 *  - `generic`  — six resource-parameterized tools
 *                 (`homestead-server/src/mcp/generic.ts`). Flattest and
 *                 cheapest; field schemas only on request.
 *
 * `typed` registers straight onto the MCP server from `buildTools`, so it has
 * no surface object. The other two are *derived* surfaces: they translate a
 * call back into the typed call it stands for and hand it to the same
 * executors, so permissions, reference checks, list caps, and custom-method
 * dispatch behave identically no matter which surface a client sees. Both
 * therefore produce the same shape, described here, and the MCP route's
 * `register.ts` registers either through one loop.
 */

import type { ToolSpec } from './tools';

/** Which tool surface `/api/mcp` exposes. */
export type McpToolMode = 'typed' | 'resource' | 'generic';

/** Outcome of a surface tool call; never thrown, always reported. */
export type SurfaceResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/** A built tool surface: what to register, and how to run it. */
export interface ToolSurface {
  tools: Record<string, ToolSpec>;
  /** Invoke one of this surface's tools under `token`. */
  execute: (name: string, args: Record<string, unknown>, token: string) => Promise<SurfaceResult>;
  /**
   * The server's initialize `instructions` — what clients hand the model once
   * per session. Each surface writes its own, because what a model needs told
   * depends on what its tool names already say.
   */
  instructions: string;
  /** The plurals exposed, in declaration order. */
  resources: string[];
}
