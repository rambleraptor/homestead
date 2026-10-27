/**
 * A server's tools, each with the household's policy for it. Changing one
 * saves the whole list. A tool's description is shown in full: it goes into
 * the assistant's prompt once the tool is on, so read it before turning it on.
 */

import { TOOL_POLICIES, type McpTool, type ToolPolicy } from '../tools';

const POLICY_LABEL: Record<ToolPolicy, string> = {
  off: 'Off',
  read: 'Use freely',
  ask: 'Ask first',
  allow: 'Allow without asking',
};

interface ToolPolicyTableProps {
  serverId: string;
  tools: McpTool[];
  onChange: (tools: McpTool[]) => void;
  disabled?: boolean;
}

export function ToolPolicyTable({ serverId, tools, onChange, disabled }: ToolPolicyTableProps) {
  if (tools.length === 0) {
    return <p className="text-sm text-gray-500">No tools yet. Check the server to fetch them.</p>;
  }
  const setPolicy = (name: string, policy: ToolPolicy) =>
    onChange(tools.map((tool) => (tool.name === name ? { ...tool, policy } : tool)));

  return (
    <ul className="divide-y divide-gray-100" data-testid={`mcp-tools-${serverId}`}>
      {tools.map((tool) => (
        <li key={tool.name} className="flex items-start justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-sm text-gray-900">
              {tool.name}
              {tool.read_only && (
                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 font-sans text-xs text-gray-600">
                  read-only
                </span>
              )}
            </p>
            {tool.description && <p className="mt-1 text-sm text-gray-600">{tool.description}</p>}
          </div>
          <select
            aria-label={`Policy for ${tool.name}`}
            value={tool.policy}
            disabled={disabled}
            onChange={(e) => setPolicy(tool.name, e.target.value as ToolPolicy)}
            data-testid={`mcp-tool-policy-${serverId}-${tool.name}`}
            className="flex-shrink-0 rounded-lg border border-gray-300 px-2 py-1 text-sm"
          >
            {TOOL_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {POLICY_LABEL[policy]}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}
