import type { McpTool } from './tools';

export type McpServerStatus = 'untested' | 'ok' | 'failing';

export interface McpServer {
  id: string;
  path: string;
  name: string;
  url: string;
  /** `credentials/{id}`, when the server needs a bearer token. */
  credential?: string;
  instructions?: string;
  tools?: McpTool[];
  status?: McpServerStatus;
  last_error?: string;
  last_checked_at?: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

export interface McpServerFormData {
  name: string;
  url: string;
  credential?: string;
}

export type McpCallOutcome = 'ok' | 'error' | 'denied' | 'refused';

/** One logged call (`mcp-call`). */
export interface McpCall {
  id: string;
  path: string;
  server?: string;
  server_name?: string;
  tool: string;
  caller?: string;
  conversation?: string;
  arguments?: string;
  outcome: McpCallOutcome;
  error?: string;
  duration_ms?: number;
  create_time: string;
}
