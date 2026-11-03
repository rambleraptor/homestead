/**
 * Any record, rendered by the app that owns it: the host every record card is
 * shown through. It looks the resource's record card up (`AppConfig.records`)
 * and renders it lazily; a resource without one, or one still loading, shows
 * as its title line. Chat renders tool calls through it, and so can any other
 * place that shows a record it doesn't otherwise know how to draw.
 */

import { Suspense } from 'react';
import type { RecordCardProps } from '@rambleraptor/homestead-core/apps/types';
import { getLazyComponent } from '@rambleraptor/homestead-core/apps/lazy';
import { recordTitle } from '@rambleraptor/homestead-core/resources/display';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { ownerOf, recordCardOf } from '../owners';

export interface RecordCardHostProps extends RecordCardProps {
  /** The resource singular (`todo`). */
  singular: string;
  /** Strike the title through: the record is gone, or about to be. */
  struck?: boolean;
}

export function RecordCard({ singular, struck, ...props }: RecordCardHostProps) {
  const owner = ownerOf(singular);
  const card = owner ? recordCardOf(owner) : undefined;
  const fallback = <RecordTitleLine snapshot={props.snapshot} struck={struck} />;
  if (!card) return fallback;
  const Card = getLazyComponent(card.component);
  return (
    <Suspense fallback={fallback}>
      <Card {...props} />
    </Suspense>
  );
}

/** A record as its title alone: what shows before (or instead of) its card. */
export function RecordTitleLine({ snapshot, struck }: { snapshot?: unknown; struck?: boolean }) {
  const title = recordTitle(snapshot);
  if (!title) return null;
  return (
    <div
      className={cn('break-words font-medium text-base', struck && 'line-through text-muted-foreground')}
      data-testid="chat-card-title"
    >
      {title}
    </div>
  );
}
