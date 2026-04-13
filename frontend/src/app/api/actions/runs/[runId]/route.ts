/**
 * GET /api/actions/runs/[runId] — current status of a run
 * POST /api/actions/runs/[runId] — provide user input for an awaiting_input run
 *
 * Caveat: aepbase runs live at /actions/{action_id}/runs/{run_id}. The
 * client only sends us `runId`, so we list the user's actions and walk
 * them to find the run — small dataset, acceptable in dev. A future
 * improvement is to have the client pass actionId too.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticate,
  aepList,
  aepGet,
  aepUpdate,
} from '../../../_lib/aepbase-server';
import { executeScript } from '../utils/execute';

interface ActionRecord {
  id: string;
}

interface ActionRunRecord {
  id: string;
  status: string;
  action?: string;
  input_request?: unknown;
}

async function findRun(
  runId: string,
  token: string,
): Promise<{ actionId: string; run: ActionRunRecord } | null> {
  const actions = await aepList<ActionRecord>('actions', token);
  for (const action of actions) {
    try {
      const run = await aepGet<ActionRunRecord>('runs', runId, token, [
        'actions',
        action.id,
      ]);
      return { actionId: action.id, run };
    } catch {
      // try the next action
    }
  }
  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { runId } = await params;
    const found = await findRun(runId, auth.token);
    if (!found) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    return NextResponse.json({ ...found.run, action: found.actionId });
  } catch (error) {
    console.error('Error fetching action run:', error);
    return NextResponse.json(
      { error: 'Failed to fetch action run' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { runId } = await params;
    const { input } = await request.json();
    if (!input) {
      return NextResponse.json(
        { error: 'input is required' },
        { status: 400 },
      );
    }

    const found = await findRun(runId, auth.token);
    if (!found) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    if (found.run.status !== 'awaiting_input') {
      return NextResponse.json(
        { error: 'Run is not awaiting input' },
        { status: 400 },
      );
    }

    await aepUpdate(
      'runs',
      runId,
      { input_response: input, status: 'pending', input_request: null },
      auth.token,
      ['actions', found.actionId],
    );

    executeScript(runId, found.actionId, auth.token).catch((err) =>
      console.error('Script execution error:', err),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error providing input:', error);
    return NextResponse.json(
      { error: 'Failed to provide input' },
      { status: 500 },
    );
  }
}
