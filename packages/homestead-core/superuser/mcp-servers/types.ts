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
