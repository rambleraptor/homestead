/**
 * An MCP server's tools as the household configures them: what the server
 * reports, plus a policy the superuser sets per tool.
 *
 * Shared by the server (`:refresh-tools`, and the broker that will call them)
 * and the SPA.
 */

/**
 * - `off` — never offered to anyone.
 * - `read` — runs without asking; for tools that only look things up.
 * - `ask` — runs only after the person approves it, every time.
 * - `allow` — runs without asking. Never a default.
 */
export const TOOL_POLICIES = ['off', 'read', 'ask', 'allow'] as const;
export type ToolPolicy = (typeof TOOL_POLICIES)[number];

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  /** The server's `readOnlyHint` annotation — a claim, not a guarantee. */
  read_only?: boolean;
  policy: ToolPolicy;
}

/** A tool as `tools/list` reports it (the fields we keep). */
export interface ListedTool {
  name: string;
  title?: string;
  description?: string;
  annotations?: { readOnlyHint?: boolean; title?: string } & Record<string, unknown>;
}

/**
 * Fold what the server now reports into the configured list. A tool keeps its
 * policy across refreshes; a new one starts `off`, so nothing the server adds
 * reaches a prompt before a superuser has read its description; one the server
 * no longer reports is dropped. Sorted by name.
 */
export function mergeTools(existing: readonly McpTool[] | undefined, listed: readonly ListedTool[]): McpTool[] {
  const policies = new Map((existing ?? []).map((t) => [t.name, t.policy]));
  const seen = new Set<string>();
  const out: McpTool[] = [];
  for (const tool of listed) {
    if (!tool.name || seen.has(tool.name)) continue;
    seen.add(tool.name);
    const title = tool.title ?? tool.annotations?.title;
    out.push({
      name: tool.name,
      ...(title ? { title } : {}),
      ...(tool.description ? { description: tool.description } : {}),
      ...(tool.annotations?.readOnlyHint !== undefined ? { read_only: tool.annotations.readOnlyHint } : {}),
      policy: policies.get(tool.name) ?? 'off',
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
