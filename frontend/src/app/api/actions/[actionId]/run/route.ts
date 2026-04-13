/**
 * POST /api/actions/[actionId]/run
 * Creates a new action_run record and triggers script execution.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticate,
  aepGet,
  aepCreate,
} from '../../../_lib/aepbase-server';
import { executeScript } from '../../runs/utils/execute';

interface ActionRecord {
  id: string;
  name: string;
  script_id: string;
  parameters?: Record<string, unknown>;
}

interface ActionRunRecord {
  id: string;
  status: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> },
) {
  try {
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { actionId } = await params;

    // Verify action exists
    try {
      await aepGet<ActionRecord>('actions', actionId, auth.token);
    } catch {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }

    const run = await aepCreate<ActionRunRecord>(
      'runs',
      { status: 'pending', logs: [] },
      auth.token,
      ['actions', actionId],
    );

    // Fire and forget.
    executeScript(run.id, actionId, auth.token).catch((err) => {
      console.error('Script execution error:', err);
    });

    return NextResponse.json({ runId: run.id, status: run.status });
  } catch (error) {
    console.error('Error creating action run:', error);
    return NextResponse.json(
      { error: 'Failed to create action run' },
      { status: 500 },
    );
  }
}
