/**
 * Action runs list hook — branches on the `actions` flag.
 *
 * In aepbase, runs are nested under actions
 * (`/actions/{id}/runs/{run_id}`), so we use the parent path instead of a
 * filter expression.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { pb } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import type { ActionRun } from '../types';

interface AepActionRun extends ActionRun {
  path: string;
  create_time: string;
  update_time: string;
}

function normalize(rec: AepActionRun | ActionRun): ActionRun {
  const ae = rec as AepActionRun;
  return {
    ...rec,
    created: ae.create_time || rec.created || '',
    updated: ae.update_time || rec.updated || '',
  };
}

export function useActionRuns(actionId: string) {
  return useQuery({
    queryKey: ['actions', 'runs', actionId],
    queryFn: async () => {
      if (isAepbaseEnabled('actions')) {
        const runs = await aepbase.list<AepActionRun>(AepCollections.ACTION_RUNS, {
          parent: [AepCollections.ACTIONS, actionId],
        });
        return runs
          .map(normalize)
          .map((r) => ({ ...r, action: actionId }))
          .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      }
      return await pb.collection('action_runs').getFullList<ActionRun>({
        filter: `action = "${actionId}"`,
        sort: '-created',
      });
    },
    enabled: !!actionId,
  });
}
