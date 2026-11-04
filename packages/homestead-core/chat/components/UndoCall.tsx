/**
 * Undo for a change the assistant made: put the fields it changed back, or
 * restore the record it deleted under its old id. Offered only while that is
 * still the right thing to do — the record holds exactly what the call set,
 * or is still gone — so an undo never writes over someone's later change.
 * Once it's back (here, after a reload, or by anyone), it says so instead.
 *
 * The write goes through the resource's shared mutation hooks, so it is an
 * ordinary write: optimistic, queued offline, and seen by everyone through
 * the change feed. The assistant isn't told: it hears about it only if the
 * person says so.
 */

import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useResourceCreate, useResourceUpdate } from '@rambleraptor/homestead-core/api/resourceHooks';
import { useCardRecord } from '@rambleraptor/homestead-core/records/useCardRecord';
import type { RecordOwner } from '@rambleraptor/homestead-core/records/owners';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { holds, type UndoPlan } from '../cards';

export interface UndoCallProps {
  owner: RecordOwner;
  plan: UndoPlan;
  /** Parent chain of a nested record (an update's; a restore is always top-level). */
  parent?: string[];
}

export function UndoCall({ owner, plan, parent }: UndoCallProps) {
  const { app, def } = owner;
  const live = useCardRecord<{ id: string } & Record<string, unknown>>({
    appId: app.id,
    singular: def.singular,
    plural: def.plural,
    id: plan.id,
    parent,
  });
  const update = useResourceUpdate(app.id, def.singular);
  const create = useResourceCreate<unknown, Record<string, unknown>>(app.id, def.singular);
  const [working, setWorking] = useState(false);

  if (live.isPending || live.error) return null;

  let state: 'undo' | 'done' | null;
  if (plan.kind === 'update') {
    if (live.deleted || !live.record) return null;
    const wasPutBack = holds(live.record, plan.previous);
    const stillAsSet = holds(live.record, plan.set);
    // Both at once: the call changed nothing, so there's nothing to undo.
    state = wasPutBack && stillAsSet ? null : wasPutBack ? 'done' : stillAsSet ? 'undo' : null;
  } else {
    state = live.deleted ? 'undo' : live.record ? 'done' : null;
  }
  if (state === null) return null;

  if (state === 'done') {
    return (
      <p className="mt-2 text-muted-foreground text-xs" data-testid="chat-card-undone">
        {plan.kind === 'update' ? 'Undone' : 'Restored'}
      </p>
    );
  }

  const undo = async () => {
    setWorking(true);
    try {
      if (plan.kind === 'update') await update.mutateAsync({ id: plan.id, data: plan.previous });
      else await create.mutateAsync({ ...plan.body, recordId: plan.id });
    } catch {
      // Shown by the global mutation error toast (queryClient.ts).
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="mt-2">
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={working}
        onClick={() => void undo()}
        data-testid="chat-card-undo"
      >
        <Undo2 className="size-3.5" aria-hidden />
        Undo
      </Button>
    </div>
  );
}
