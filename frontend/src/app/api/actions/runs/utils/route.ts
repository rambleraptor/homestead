/**
 * API Route: Execute Action Run
 *
 * POST /api/actions/runs/utils/execute
 * Executes the Playwright script for an action_run
 *
 * Body: { runId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPocketBase } from '@/core/api/pocketbase';
import { executeScript } from './execute';

export async function POST(request: NextRequest) {
  try {
    const { runId } = await request.json();

    if (!runId) {
      return NextResponse.json(
        { error: 'runId is required' },
        { status: 400 }
      );
    }

    const pb = getPocketBase(request);
    const pocketbaseUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
    const pocketbaseToken = pb.authStore.token;

    // Await execution so it completes before the response context is torn down
    await executeScript(runId, pocketbaseUrl, pocketbaseToken);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error triggering execution:', error);
    return NextResponse.json(
      { error: 'Failed to trigger execution' },
      { status: 500 }
    );
  }
}
