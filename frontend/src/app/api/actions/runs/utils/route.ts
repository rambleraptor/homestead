/**
 * POST /api/actions/runs/utils/execute — triggers execution of a run.
 * Body: { runId: string, actionId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '../../../_lib/aepbase-server';
import { executeScript } from './execute';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { runId, actionId } = await request.json();
    if (!runId || !actionId) {
      return NextResponse.json(
        { error: 'runId and actionId are required' },
        { status: 400 },
      );
    }

    await executeScript(runId, actionId, auth.token);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error triggering execution:', error);
    return NextResponse.json(
      { error: 'Failed to trigger execution' },
      { status: 500 },
    );
  }
}
