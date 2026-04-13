/**
 * Script Execution Utility
 *
 * Runs a Playwright-style script dispatched by an action_run. Reads/writes
 * the run and action via aepbase using the caller's token.
 */

import path from 'path';
import {
  aepGet,
  aepUpdate,
} from '../../../_lib/aepbase-server';

const MAX_LOG_ENTRIES = 1000;

class ActionLogger {
  logs: Array<{ timestamp: string; level: string; message: string }> = [];

  log(message: string) {
    this.addLog('info', message);
    console.log(`[Action] ${message}`);
  }
  warn(message: string) {
    this.addLog('warn', message);
    console.warn(`[Action] ${message}`);
  }
  error(message: string) {
    this.addLog('error', message);
    console.error(`[Action] ${message}`);
  }
  addLog(level: string, message: string) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message: String(message),
    });
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs = this.logs.slice(-MAX_LOG_ENTRIES);
    }
  }
}

interface ActionRecord {
  id: string;
  name: string;
  script_id: string;
  parameters?: Record<string, unknown>;
}

/**
 * Execute a Playwright script for a given run.
 *
 * Signature is `(runId, actionId, token)`. The actionId is required because
 * runs live at `/actions/{actionId}/runs/{runId}` in aepbase.
 */
export async function executeScript(
  runId: string,
  actionId: string,
  token: string,
) {
  const logger = new ActionLogger();
  const startTime = Date.now();
  const runParent = ['actions', actionId];

  try {
    const action = await aepGet<ActionRecord>('actions', actionId, token);

    await aepUpdate(
      'runs',
      runId,
      { status: 'running', started_at: new Date().toISOString() },
      token,
      runParent,
    );

    logger.log(`Starting script: ${action.script_id}`);
    logger.log(`Parameters: ${Object.keys(action.parameters || {}).join(', ')}`);

    const scriptPath = path.join(
      process.cwd(),
      '..',
      'scripts',
      'actions',
      `${action.script_id}.js`,
    );
    logger.log(`Loading script from: ${scriptPath}`);

    const scriptModule = await import(scriptPath);
    if (typeof scriptModule.run !== 'function') {
      throw new Error(
        `Script ${action.script_id} does not export a 'run' function`,
      );
    }

    logger.log('Executing script...');
    const result = await scriptModule.run(action.parameters || {}, logger);

    const duration = Date.now() - startTime;
    logger.log(`Script completed in ${duration}ms`);

    await aepUpdate(
      'runs',
      runId,
      {
        status: 'success',
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        result,
        logs: logger.logs,
      },
      token,
      runParent,
    );

    await aepUpdate(
      'actions',
      action.id,
      { last_run_at: new Date().toISOString() },
      token,
    );

    logger.log('✅ Action completed successfully');
  } catch (err: unknown) {
    const duration = Date.now() - startTime;
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Script failed: ${message}`);

    if (message.includes('2FA verification required')) {
      logger.log('⏸️  Waiting for user input (2FA code)');
      await aepUpdate(
        'runs',
        runId,
        {
          status: 'awaiting_input',
          input_request: {
            prompt: 'Enter the 6-digit verification code sent to your email',
            field_name: 'verificationCode',
            field_type: 'text',
            placeholder: '000000',
          },
          logs: logger.logs,
        },
        token,
        runParent,
      );
      return;
    }

    await aepUpdate(
      'runs',
      runId,
      {
        status: 'error',
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        error: message,
        logs: logger.logs,
      },
      token,
      runParent,
    );

    logger.log('❌ Action failed');
  }
}
