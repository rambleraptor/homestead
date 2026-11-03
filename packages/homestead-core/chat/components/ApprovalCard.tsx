/**
 * A tool call waiting on the person (`confirm` custom methods — sending a
 * household member a message — and "ask first" tools on outside MCP servers):
 * what it would do, in their terms, and Approve or Deny. Nothing runs until
 * they answer; the reply then carries on.
 *
 * Built on AI Elements' `Confirmation`, which keys off the tool part's
 * `approval` and `state`: the request and its actions show only while the
 * call is `approval-requested`. A call on one of Homestead's resources shows
 * as its card in `proposed` mode (`./ChatCard`); a bulk import shows the rows
 * it would save; an outside tool its arguments.
 */

import type { BulkImportPreview } from '@rambleraptor/homestead-client';
import { bulkImportBody, rowLabel, selectedRows } from '../importPreview';
import { useState } from 'react';
import { ShieldQuestion } from 'lucide-react';
import type { ToolUIPart } from 'ai';
import {
  Confirmation,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@rambleraptor/homestead-core/shared/components/ai-elements/confirmation';
import { useHousehold } from '@rambleraptor/homestead-core/household/useHousehold';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { toolAction } from '../hooks/useConversation';
import { useMcpToolLabel } from '../hooks/useMcpToolLabel';
import { ownerForTool } from '../cards';
import { CardFace } from './ChatCard';

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
  /** Look up the bulk-import preview a `:bulk-import` write names. */
  findPreview?: (previewId: string) => BulkImportPreview | null;
  /** Answer it; rejects when the answer couldn't be sent. */
  onAnswer: (approvalId: string, approved: boolean) => Promise<void>;
  /** Another turn is running, so it can't be answered yet. */
  disabled?: boolean;
}

export function ApprovalCard({ part, onAnswer, disabled, findPreview }: ApprovalCardProps) {
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

  const importBody = mcp ? null : bulkImportBody(part.input);
  const owner = mcp || importBody ? undefined : ownerForTool(part.type);

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
    <Confirmation
      approval={part.approval}
      state={part.state}
      className="w-full border-amber-300 bg-amber-50"
      data-testid="chat-approval"
    >
      <ConfirmationTitle className="flex items-center gap-2 font-medium text-foreground">
        <ShieldQuestion className="size-4 text-amber-600" aria-hidden />
        Approve this?
      </ConfirmationTitle>
      <ConfirmationRequest>
        {owner && <CardFace part={part} owner={owner} mode="proposed" />}
        <dl className="space-y-1 text-foreground empty:hidden">
          {!owner && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Action</dt>
              <dd data-testid="chat-approval-action">{mcp ? mcp.tool : actionLabel(part)}</dd>
            </div>
          )}
          {mcp && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">On</dt>
              <dd data-testid="chat-approval-service">{mcp.server}</dd>
            </div>
          )}
          {recipient && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">To</dt>
              <dd data-testid="chat-approval-to">{recipient}</dd>
            </div>
          )}
          {importBody ? <ImportRows body={importBody} findPreview={findPreview} /> : null}
          {(importBody || owner ? [] : detailRows(part.input, mcp !== null)).map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-wrap break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </ConfirmationRequest>
      <ConfirmationActions>
        <ConfirmationAction
          variant="outline"
          onClick={() => void answer(false)}
          disabled={disabled || answering}
          data-testid="chat-approval-deny"
        >
          Deny
        </ConfirmationAction>
        <ConfirmationAction
          onClick={() => void answer(true)}
          disabled={disabled || answering}
          data-testid="chat-approval-approve"
        >
          Approve
        </ConfirmationAction>
      </ConfirmationActions>
    </Confirmation>
  );
}

/** What a bulk import would save: the chosen rows of the preview it names. */
function ImportRows({
  body,
  findPreview,
}: {
  body: Record<string, unknown>;
  findPreview?: (previewId: string) => BulkImportPreview | null;
}) {
  const previewId = typeof body.preview_id === 'string' ? body.preview_id : null;
  const preview = previewId ? (findPreview?.(previewId) ?? null) : null;
  if (!preview) {
    return (
      <div className="flex gap-2">
        <dt className="text-muted-foreground">Import</dt>
        <dd>{previewId ? 'the rows of an earlier preview' : 'the input, without a preview'}</dd>
      </div>
    );
  }
  const rows = selectedRows(preview, body.selected_indices);
  return (
    <div>
      <dt className="text-muted-foreground">
        Import {rows.length} {rows.length === 1 ? 'row' : 'rows'}
      </dt>
      <dd>
        <ul className="ml-4 list-disc" data-testid="chat-approval-import-rows">
          {rows.map((row) => (
            <li key={row.index}>
              {rowLabel(row)}
              {row.warnings.length > 0 && (
                <span className="text-muted-foreground"> — {row.warnings.join('; ')}</span>
              )}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}
