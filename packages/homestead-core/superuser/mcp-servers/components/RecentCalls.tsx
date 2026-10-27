/**
 * A server's recent calls, from the `mcp-call` log: when, who, which tool, and
 * how it went. Superusers only, like the log itself.
 */

import { getAepErrorMessage } from '@rambleraptor/homestead-core/api/errorMessage';
import { useHousehold } from '@rambleraptor/homestead-core/household/useHousehold';
import { referenceId } from '@rambleraptor/homestead-core/resources/references';
import { useRecentMcpCalls } from '../hooks/useMcpServers';
import type { McpCallOutcome } from '../types';

const OUTCOME_STYLE: Record<McpCallOutcome, string> = {
  ok: 'bg-green-50 text-green-700',
  error: 'bg-red-50 text-red-700',
  denied: 'bg-amber-50 text-amber-700',
  refused: 'bg-gray-100 text-gray-600',
};
const OUTCOME_LABEL: Record<McpCallOutcome, string> = {
  ok: 'OK',
  error: 'Failed',
  denied: 'Declined',
  refused: 'Not allowed',
};

export function RecentCalls({ serverId }: { serverId: string }) {
  const { data: calls, isLoading, isError, error } = useRecentMcpCalls(serverId);
  const { data: household } = useHousehold();
  const nameOf = (caller?: string) => {
    if (!caller) return 'Someone';
    const id = referenceId(caller, 'users');
    return household?.find((member) => member.id === id)?.name ?? 'Someone';
  };

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading recent calls…</p>;
  }
  if (isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Couldn’t load recent calls: {getAepErrorMessage(error)}
      </p>
    );
  }
  if (!calls?.length) {
    return (
      <p className="text-sm text-gray-500" data-testid={`mcp-calls-empty-${serverId}`}>
        No calls yet.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-gray-100 text-sm" data-testid={`mcp-calls-${serverId}`}>
      {calls.map((call) => (
        <li key={call.id} className="py-2" data-testid={`mcp-call-${call.id}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLE[call.outcome] ?? OUTCOME_STYLE.refused}`}
            >
              {OUTCOME_LABEL[call.outcome] ?? call.outcome}
            </span>
            <span className="font-mono text-xs text-gray-900">{call.tool}</span>
            <span className="text-gray-600">{nameOf(call.caller)}</span>
            <span className="text-xs text-gray-400">{new Date(call.create_time).toLocaleString()}</span>
            {call.duration_ms !== undefined && (
              <span className="text-xs text-gray-400">{call.duration_ms} ms</span>
            )}
          </div>
          {call.error && <p className="mt-1 text-xs text-gray-600">{call.error}</p>}
        </li>
      ))}
    </ul>
  );
}
