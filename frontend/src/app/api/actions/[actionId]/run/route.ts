/**
 * API Route: Run Action
 *
 * POST /api/actions/[actionId]/run
 * Creates a new action_run record and triggers script execution
 *
 * Returns: { runId: string, status: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPocketBase } from '@/core/api/pocketbase';
import { executeScript } from '../../runs/utils/execute';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ actionId: string }> }
) {
  try {
    const pb = getPocketBase(request);
    const { actionId } = await params;

    // Verify action exists
    const action = await pb.collection('actions').getOne(actionId);

    if (!action) {
      return NextResponse.json(
        { error: 'Action not found' },
        { status: 404 }
      );
    }

    // Create action_run record
    const run = await pb.collection('action_runs').create({
      action: actionId,
      status: 'pending',
      logs: [],
    });

    // Trigger execution asynchronously (non-blocking, runs in background)
    const pocketbaseUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
    const pocketbaseToken = pb.authStore.token;
    executeScript(run.id, pocketbaseUrl, pocketbaseToken).catch(err => {
      console.error('Script execution error:', err);
    });

    return NextResponse.json({
      runId: run.id,
      status: run.status,
    });

  } catch (error) {
    console.error('Error creating action run:', error);
    return NextResponse.json(
      { error: 'Failed to create action run' },
      { status: 500 }
    );
  }
}
