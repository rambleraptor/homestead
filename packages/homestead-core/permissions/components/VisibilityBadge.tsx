/**
 * States who can see a record of a per-record resource: a lock on a private
 * one, and (with `showShared`) a people icon on a household one. Read-only —
 * visibility is fixed when a record is made. Renders nothing for a resource
 * that has no such choice.
 */

import { Lock, Users } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { isPrivateRecord, recordVisibility } from '../visibility';

export interface VisibilityBadgeProps {
  /** The resource's `singular`. */
  singular: string;
  record: Record<string, unknown>;
  /** Also mark a household record. By default only a private one is marked. */
  showShared?: boolean;
  className?: string;
}

export function VisibilityBadge({ singular, record, showShared = false, className }: VisibilityBadgeProps) {
  if (!recordVisibility(singular)) return null;
  const isPrivate = isPrivateRecord(singular, record);
  if (!isPrivate && !showShared) return null;
  const Icon = isPrivate ? Lock : Users;
  const label = isPrivate ? 'Private' : 'Family';
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs text-text-muted', className)}
      title={isPrivate ? 'Only whoever made it can see it' : 'Everyone in the household can see it'}
      data-testid={`visibility-badge-${isPrivate ? 'private' : 'shared'}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
