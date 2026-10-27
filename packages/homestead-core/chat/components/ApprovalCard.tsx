/**
 * A tool call waiting on the person (`confirm` custom methods — sending a
 * household member a message — and "ask first" tools on outside MCP servers):
 * what it would do, in their terms, and Approve or Deny. Nothing runs until they answer; the reply then carries on.
 */

import { useState } from 'react';
import { ShieldQuestion } from 'lucide-react';
import type { ToolUIPart } from 'ai';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { useHousehold } from '@rambleraptor/homestead-core/household/useHousehold';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { toolAction } from '../hooks/useConversation';
import { useMcpToolLabel } from '../hooks/useMcpToolLabel';

/** `notifications` + `:send` → "Notifications: send". */
function actionLabel(part: ToolUIPart): string {
  const resource = part.type.slice('tool-'.length).replace(/_/g, ' ');
  const verb = toolAction(part.input).replace(/^:/, '').replace(/-/g, ' ');
  return `${resource[0]?.toUpperCase() ?? ''}${resource.slice(1)}: ${verb}`;
}

/** The text fields the call would send, as label/value rows. An outside tool's are its arguments. */
function detailRows(input: unknown, outside: boolean): Array<[string, string]> {
  const args = (input ?? {}) as Record<string, unknown>;
  const body = outside
    ? args
    : (typeof args.body === 'object' && args.body) || (typeof args.fields === 'object' && args.fields) || {};
  return Object.entries(body as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => [k[0]!.toUpperCase() + k.slice(1).replace(/_/g, ' '), String(v)]);
}

export interface ApprovalCardProps {
  part: ToolUIPart;
  /** Answer it; rejects when the answer couldn't be sent. */
  onAnswer: (approvalId: string, approved: boolean) => Promise<void>;
  /** Another turn is running, so it can't be answered yet. */
  disabled?: boolean;
}

export function ApprovalCard({ part, onAnswer, disabled }: ApprovalCardProps) {
  const household = useHousehold();
  const toast = useToast();
  const [answering, setAnswering] = useState(false);
  const mcp = useMcpToolLabel(part.type);
  const approvalId = part.approval?.id;
  const userId = (part.input as { user_id?: unknown } | undefined)?.user_id;
  const recipient =
    typeof userId === 'string'
      ? (household.data?.find((m) => m.id === userId)?.name ?? 'a household member')
      : undefined;

  const answer = async (approved: boolean) => {
    if (!approvalId) return;
    setAnswering(true);
    try {
      await onAnswer(approvalId, approved);
    } catch (err) {
      toast.error(err);
    } finally {
      setAnswering(false);
    }
  };

  return (
    <div
      className="w-full rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
      data-testid="chat-approval"
    >
      <div className="mb-2 flex items-center gap-2 font-medium text-gray-900">
        <ShieldQuestion className="size-4 text-amber-600" aria-hidden />
        Approve this?
      </div>
      <dl className="mb-3 space-y-1">
        <div className="flex gap-2">
          <dt className="text-gray-500">Action</dt>
          <dd data-testid="chat-approval-action">{mcp ? mcp.tool : actionLabel(part)}</dd>
        </div>
        {mcp && (
          <div className="flex gap-2">
            <dt className="text-gray-500">On</dt>
            <dd data-testid="chat-approval-service">{mcp.server}</dd>
          </div>
        )}
        {recipient && (
          <div className="flex gap-2">
            <dt className="text-gray-500">To</dt>
            <dd data-testid="chat-approval-to">{recipient}</dd>
          </div>
        )}
        {detailRows(part.input, mcp !== null).map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="text-gray-500">{label}</dt>
            <dd className="whitespace-pre-wrap break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void answer(true)}
          disabled={disabled || answering}
          data-testid="chat-approval-approve"
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void answer(false)}
          disabled={disabled || answering}
          data-testid="chat-approval-deny"
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
