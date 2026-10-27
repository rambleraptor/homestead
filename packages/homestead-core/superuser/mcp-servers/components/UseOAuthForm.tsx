/**
 * Switch a server to OAuth sign-in. Most servers register Homestead as a
 * client themselves, so every field is optional; a provider that doesn't
 * (Google, for one) needs a client registered by hand, pasted here.
 */

import { useState } from 'react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/ui/input';
import { Label } from '@rambleraptor/homestead-core/shared/components/ui/label';
import { OAUTH_CALLBACK_PATH } from '../hooks/useMcpServers';

export interface UseOAuthFormValues {
  clientId?: string;
  clientSecret?: string;
  scope?: string;
}

interface UseOAuthFormProps {
  onSubmit: (values: UseOAuthFormValues) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function UseOAuthForm({ onSubmit, onCancel, isSubmitting }: UseOAuthFormProps) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scope, setScope] = useState('');
  const redirectUri = `${window.location.origin}${OAUTH_CALLBACK_PATH}`;

  return (
    <form
      className="space-y-4"
      data-testid="use-oauth-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          clientId: clientId.trim() || undefined,
          clientSecret: clientSecret || undefined,
          scope: scope.trim() || undefined,
        });
      }}
    >
      <p className="text-sm text-gray-600">
        Homestead signs in to the server as the household and keeps the sign-in fresh. Most servers register
        Homestead themselves — leave the client blank. If the provider needs one registered by hand, give it this
        redirect address:
      </p>
      <p className="break-all rounded bg-gray-50 p-2 font-mono text-xs text-gray-700" data-testid="oauth-redirect-uri">
        {redirectUri}
      </p>
      <div className="space-y-1">
        <Label htmlFor="oauth-client-id">Client ID (optional)</Label>
        <Input
          id="oauth-client-id"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          autoComplete="off"
          data-testid="oauth-client-id"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="oauth-client-secret">Client secret (optional)</Label>
        <Input
          id="oauth-client-secret"
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          autoComplete="new-password"
          data-testid="oauth-client-secret"
        />
        <p className="text-xs text-gray-500">Stored encrypted; nobody can read it back.</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="oauth-scope">Scopes (optional)</Label>
        <Input
          id="oauth-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          placeholder="Space-separated; blank for the server’s default"
          autoComplete="off"
          data-testid="oauth-scope"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} data-testid="use-oauth-cancel">
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} data-testid="use-oauth-submit">
          {isSubmitting ? 'Connecting…' : 'Connect'}
        </Button>
      </div>
    </form>
  );
}
