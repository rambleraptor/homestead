/**
 * Where an OAuth provider sends the browser back after a sign-in
 * (`/superuser/mcp-servers/oauth-callback?code=…&state=…`). The code goes to
 * the server under this superuser's own session (`:finish-connect`), which
 * checks the `state` was theirs — then back to MCP servers.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { getAepErrorMessage } from '@rambleraptor/homestead-core/api/errorMessage';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { takeConnectingServer, useFinishConnect } from '../hooks/useMcpServers';

export function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const finish = useFinishConnect();
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const serverId = takeConnectingServer();
    const code = params.get('code');
    const state = params.get('state');
    const denied = params.get('error');
    if (denied) {
      setFailure(`The provider didn’t sign in: ${params.get('error_description') ?? denied}.`);
      return;
    }
    if (!serverId || !code || !state) {
      setFailure('This sign-in can’t be finished here. Start it again from MCP servers.');
      return;
    }
    finish
      .mutateAsync({ id: serverId, code, state })
      .then((server) => {
        if (server.status === 'ok') toast.success(`${server.name} is connected.`);
        else toast.error(`${server.name} is signed in, but checking it failed: ${server.last_error ?? 'unknown error'}`);
        navigate('/superuser/mcp-servers', { replace: true });
      })
      .catch((err: unknown) => setFailure(getAepErrorMessage(err)));
  }, [finish, navigate, params, toast]);

  return (
    <Card>
      <div className="space-y-3 py-6 text-center" data-testid="oauth-callback">
        {failure ? (
          <>
            <p role="alert" className="text-sm text-red-700" data-testid="oauth-callback-error">
              {failure}
            </p>
            <Link to="/superuser/mcp-servers" className="text-sm text-accent-terracotta hover:underline">
              Back to MCP servers
            </Link>
          </>
        ) : (
          <p className="text-sm text-gray-600">Finishing the sign-in…</p>
        )}
      </div>
    </Card>
  );
}
