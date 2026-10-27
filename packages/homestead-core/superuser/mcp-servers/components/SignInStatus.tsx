/**
 * A server's OAuth sign-in on its card: whether it's connected (and since
 * when), or needs connecting again, with Connect / Reconnect / Disconnect. A
 * server without a credential offers "Sign in with OAuth" instead.
 */

import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import type { Credential } from '../../credentials/types';
import {
  providerNavigation,
  useConnectMcpServer,
  useDisconnectMcpServer,
  useSwitchToOAuth,
} from '../hooks/useMcpServers';
import type { McpServer } from '../types';
import { UseOAuthForm, type UseOAuthFormValues } from './UseOAuthForm';

type SignIn = 'connected' | 'reconnect' | 'not-connected';

/** Where a server's sign-in stands, from its credential and its last check. */
export function signInState(server: McpServer, credential: Credential): SignIn {
  if (!credential.oauth_connected_at || credential.oauth_state?.set !== true) return 'not-connected';
  if (credential.oauth_resource !== server.url) return 'reconnect';
  if (server.status === 'failing' && /reconnect/i.test(server.last_error ?? '')) return 'reconnect';
  return 'connected';
}

const LABEL: Record<SignIn, string> = {
  connected: 'Signed in',
  reconnect: 'Reconnect needed',
  'not-connected': 'Not connected',
};

interface SignInStatusProps {
  server: McpServer;
  /** The server's credential, once loaded; undefined when it has none. */
  credential: Credential | undefined;
}

export function SignInStatus({ server, credential }: SignInStatusProps) {
  const [choosing, setChoosing] = useState(false);
  const switchOAuth = useSwitchToOAuth();
  const connect = useConnectMcpServer();
  const disconnect = useDisconnectMcpServer();

  const startSignIn = async (id: string) => {
    try {
      const url = await connect.mutateAsync(id);
      providerNavigation.go(url);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const switchToOAuth = async (values: UseOAuthFormValues) => {
    try {
      await switchOAuth.mutateAsync({ server, ...values });
      setChoosing(false);
      await startSignIn(server.id);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  if (!server.credential) {
    return (
      <>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setChoosing(true)}
          data-testid={`use-oauth-${server.id}`}
        >
          <LogIn className="mr-1 h-4 w-4" />
          Sign in with OAuth
        </Button>
        <Modal isOpen={choosing} onClose={() => setChoosing(false)} title={`Sign in to ${server.name}`}>
          {choosing && (
            <UseOAuthForm
              onSubmit={switchToOAuth}
              onCancel={() => setChoosing(false)}
              isSubmitting={switchOAuth.isPending || connect.isPending}
            />
          )}
        </Modal>
      </>
    );
  }
  if (credential?.kind !== 'oauth') return null;

  const state = signInState(server, credential);
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`sign-in-${server.id}`}>
      <span
        className={`rounded px-2 py-0.5 text-xs font-medium ${
          state === 'connected' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'
        }`}
        data-testid={`sign-in-status-${server.id}`}
      >
        {LABEL[state]}
        {state === 'connected' && credential.oauth_connected_at
          ? ` · since ${new Date(credential.oauth_connected_at).toLocaleDateString()}`
          : ''}
      </span>
      <Button
        variant={state === 'connected' ? 'secondary' : 'primary'}
        size="sm"
        onClick={() => void startSignIn(server.id)}
        disabled={connect.isPending}
        data-testid={`connect-${server.id}`}
      >
        {state === 'not-connected' ? 'Connect' : 'Reconnect'}
      </Button>
      {state !== 'not-connected' && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => disconnect.mutate(server.id)}
          disabled={disconnect.isPending}
          data-testid={`disconnect-${server.id}`}
        >
          Disconnect
        </Button>
      )}
    </div>
  );
}
