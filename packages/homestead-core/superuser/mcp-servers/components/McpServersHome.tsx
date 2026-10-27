/**
 * MCP servers — the outside services the household assistant can use, each on
 * a shared household account.
 *
 * A superuser adds a server (address + the credential holding its token),
 * checks it to fetch its tools, sets a policy per tool, and shares it with the
 * groups who may use it. Nobody can use a server it hasn't been shared with.
 */

import { useState } from 'react';
import { Pencil, Plug, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { ShareButton } from '@rambleraptor/homestead-core/permissions/components/ShareButton';
import { getAepErrorMessage } from '@rambleraptor/homestead-core/api/errorMessage';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import {
  useCreateMcpServer,
  useDeleteMcpServer,
  useMcpServers,
  useRefreshMcpTools,
  useUpdateMcpServer,
} from '../hooks/useMcpServers';
import { McpServerForm } from './McpServerForm';
import { RecentCalls } from './RecentCalls';
import { ToolPolicyTable } from './ToolPolicyTable';
import type { McpTool } from '../tools';
import type { McpServer, McpServerFormData } from '../types';

type Editing = { kind: 'new' } | { kind: 'edit'; server: McpServer } | null;

const STATUS_STYLE: Record<string, string> = {
  ok: 'bg-green-50 text-green-700',
  failing: 'bg-red-50 text-red-700',
  untested: 'bg-gray-100 text-gray-600',
};
const STATUS_LABEL: Record<string, string> = { ok: 'Connected', failing: 'Failing', untested: 'Not checked' };

function ServerCard({ server }: { server: McpServer }) {
  const [expanded, setExpanded] = useState(false);
  const [showCalls, setShowCalls] = useState(false);
  const updateServer = useUpdateMcpServer();
  const refreshTools = useRefreshMcpTools();
  const tools = server.tools ?? [];
  const enabled = tools.filter((t) => t.policy !== 'off').length;
  const status = server.status ?? 'untested';

  const saveTools = async (next: McpTool[]) => {
    try {
      await updateServer.mutateAsync({ id: server.id, data: { tools: next } });
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };
  const check = async () => {
    try {
      await refreshTools.mutateAsync(server.id);
      setExpanded(true);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <div className="space-y-3" data-testid={`mcp-server-${server.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? STATUS_STYLE.untested}`}
          data-testid={`mcp-server-status-${server.id}`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
        <span className="text-sm text-gray-600" data-testid={`mcp-server-tool-count-${server.id}`}>
          {enabled} of {tools.length} tools on
        </span>
        {server.last_checked_at && (
          <span className="text-xs text-gray-400">
            checked {new Date(server.last_checked_at).toLocaleString()}
          </span>
        )}
      </div>
      {status === 'failing' && server.last_error && (
        <p className="text-sm text-red-700" role="alert" data-testid={`mcp-server-error-${server.id}`}>
          {server.last_error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={check}
          disabled={refreshTools.isPending}
          data-testid={`check-mcp-server-${server.id}`}
        >
          <RefreshCw className={`mr-1 h-4 w-4 ${refreshTools.isPending ? 'animate-spin' : ''}`} />
          {refreshTools.isPending ? 'Checking…' : 'Check tools'}
        </Button>
        {tools.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            data-testid={`toggle-mcp-tools-${server.id}`}
          >
            {expanded ? 'Hide tools' : 'Tools'}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowCalls((open) => !open)}
          aria-expanded={showCalls}
          data-testid={`toggle-mcp-calls-${server.id}`}
        >
          {showCalls ? 'Hide calls' : 'Recent calls'}
        </Button>
        <ShareButton
          resourceType="mcp-server"
          recordId={server.id}
          recordName={server.name}
          ownerId={server.created_by}
          appId="mcp-servers"
        />
      </div>
      {expanded && (
        <ToolPolicyTable
          serverId={server.id}
          tools={tools}
          onChange={saveTools}
          disabled={updateServer.isPending}
        />
      )}
      {showCalls && <RecentCalls serverId={server.id} />}
    </div>
  );
}

export function McpServersHome() {
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<McpServer | null>(null);
  const { data: servers, isLoading, isError, error } = useMcpServers();
  const createServer = useCreateMcpServer();
  const updateServer = useUpdateMcpServer();
  const deleteServer = useDeleteMcpServer();

  const handleSubmit = async (data: McpServerFormData) => {
    try {
      if (editing?.kind === 'edit') {
        await updateServer.mutateAsync({
          id: editing.server.id,
          data: { name: data.name, url: data.url, credential: data.credential || null },
        });
      } else {
        const userId = aepbase.getCurrentUser()?.id;
        await createServer.mutateAsync({
          name: data.name,
          url: data.url,
          ...(data.credential ? { credential: data.credential } : {}),
          ...(userId ? { created_by: `users/${userId}` } : {}),
        });
      }
      setEditing(null);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteServer.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  if (isLoading) {
    return <SkeletonPage body="list" label="Loading MCP servers" data-testid="mcp-servers-loading" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="MCP servers"
        subtitle="Outside services the assistant can use, on a shared household account. Check a server to fetch its tools, choose what each tool may do, and share it with the groups who may use it."
        actions={
          <Button onClick={() => setEditing({ kind: 'new' })} data-testid="add-mcp-server-button">
            <Plus className="mr-2 h-4 w-4" />
            Add server
          </Button>
        }
      />

      {isError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn’t load MCP servers: {getAepErrorMessage(error)}
        </div>
      ) : !servers?.length ? (
        <Card>
          <div className="py-10 text-center" data-testid="mcp-servers-empty">
            <Plug className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-gray-600">No MCP servers yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Add one — Home Assistant, a calendar — to let the assistant use it.
            </p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3" data-testid="mcp-servers-list">
          {servers.map((server) => (
            <li key={server.id}>
              <Card>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900">{server.name}</h3>
                    <p className="mt-1 truncate font-mono text-xs text-gray-500">{server.url}</p>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditing({ kind: 'edit', server })}
                      aria-label={`Edit ${server.name}`}
                      data-testid={`edit-mcp-server-${server.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDeleting(server)}
                      aria-label={`Delete ${server.name}`}
                      data-testid={`delete-mcp-server-${server.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3">
                  <ServerCard server={server} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.kind === 'edit' ? `Edit ${editing.server.name}` : 'Add MCP server'}
      >
        {editing && (
          <McpServerForm
            initialData={editing.kind === 'edit' ? editing.server : undefined}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
            isSubmitting={createServer.isPending || updateServer.isPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete MCP server"
        message={`Delete “${deleting?.name ?? ''}”? The assistant stops using it, and anyone it was shared with loses it. Its credential is kept.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteServer.isPending}
      />
    </div>
  );
}
