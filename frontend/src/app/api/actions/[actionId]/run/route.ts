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

    // Trigger execution asynchronously (non-blocking)
    // The execution will happen in a separate request
    fetch(`${request.nextUrl.origin}/api/actions/runs/utils`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': request.headers.get('Authorization') || '',
      },
      body: JSON.stringify({ runId: run.id }),
    }).catch(err => {
      console.error('Failed to trigger execution:', err);
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
