/**
 * Add or edit an MCP server: its name, address, and the credential holding its
 * token. Tools, status and instructions come from the server itself
 * (`:refresh-tools`), so the form leaves them out.
 */

import { SchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { mcpServersResources } from '../resources';
import type { McpServer, McpServerFormData } from '../types';

const serverDef = mcpServersResources[0]!;
const SERVER_MANAGED = ['instructions', 'tools', 'status', 'last_error', 'last_checked_at'] as const;

interface McpServerFormProps {
  onSubmit: (data: McpServerFormData) => void | Promise<void>;
  onCancel: () => void;
  initialData?: McpServer;
  isSubmitting?: boolean;
}

export function McpServerForm({ onSubmit, onCancel, initialData, isSubmitting }: McpServerFormProps) {
  const mode = initialData ? 'edit' : 'create';
  return (
    <SchemaForm<McpServerFormData>
      resource={serverDef}
      mode={mode}
      initialData={initialData}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      testId="mcp-server-form"
      submitTestId="mcp-server-form-submit"
      cancelTestId="mcp-server-form-cancel"
      submitLabel={mode === 'edit' ? 'Save' : 'Add server'}
      layout={{ columns: 1 }}
      fields={{
        name: { testId: 'mcp-server-name', placeholder: 'e.g. Home Assistant', autoFocus: true },
        url: {
          testId: 'mcp-server-url',
          label: 'Server URL',
          placeholder: 'http://homeassistant.local:8123/api/mcp',
          help: 'The server’s Streamable HTTP endpoint. Home-network addresses are fine.',
        },
        credential: {
          testId: 'mcp-server-credential',
          collection: 'credentials',
          labelField: 'name',
          help: 'The bearer token Homestead sends. Add it under Credentials first.',
          emptyMessage: 'No credentials yet — add one under Credentials.',
        },
        ...Object.fromEntries(SERVER_MANAGED.map((name) => [name, { hidden: true }])),
      }}
    />
  );
}
