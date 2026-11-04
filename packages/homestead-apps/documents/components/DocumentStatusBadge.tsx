/**
 * The parse-lifecycle badge, shared by the list rows and the detail page.
 *
 * `unmatched` is deliberately styled as neutral information, not a warning:
 * most household documents aren't a known form, and that's a normal outcome
 * rather than something the user needs to fix.
 */

import { FileText, Loader2, AlertCircle, HelpCircle } from 'lucide-react';
import type { ParseStatus } from '../resources';

const STATUS_META: Record<
  ParseStatus,
  { label: string; className: string; icon: typeof FileText }
> = {
  pending: { label: 'Reading…', className: 'bg-blue-50 text-blue-700', icon: Loader2 },
  parsed: { label: 'Parsed', className: 'bg-green-50 text-green-700', icon: FileText },
  unmatched: {
    label: 'No matching type',
    className: 'bg-gray-100 text-text-muted',
    icon: HelpCircle,
  },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700', icon: AlertCircle },
};

export function DocumentStatusBadge({ status }: { status: ParseStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs ${meta.className}`}
      data-testid="document-status"
    >
      <Icon className={`h-3 w-3 ${status === 'pending' ? 'animate-spin' : ''}`} />
      {meta.label}
    </span>
  );
}
