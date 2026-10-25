/**
 * "Which one is you?" — shown on People to someone whose account isn't linked
 * to a person yet, so the assistant can learn who they are (and so who their
 * family is). Suggests the one person whose name matches theirs, else offers a
 * picker. Dismissing it is remembered on this device.
 */

import { useState } from 'react';
import { UserCheck, X } from 'lucide-react';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { usePeople } from '../hooks/usePeople';
import { useLinkAccount } from '../hooks/useLinkAccount';
import { suggestSelf } from '../utils/whoAmI';

const dismissKey = (userId: string) => `people.which-one-is-you.dismissed.${userId}`;

function readDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(userId)) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(userId: string): void {
  try {
    localStorage.setItem(dismissKey(userId), '1');
  } catch {
    // Storage unavailable: the banner just comes back next visit.
  }
}

export function WhichOneIsYou() {
  const { user } = useAuth();
  const { data: people } = usePeople();
  const link = useLinkAccount();
  const [dismissed, setDismissed] = useState(() => (user ? readDismissed(user.id) : true));
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState('');

  if (!user || !people || people.length === 0 || dismissed) return null;
  if (people.some((p) => p.user === user.id)) return null;

  const suggestion = picking ? undefined : suggestSelf(people, user.name);
  const linkTo = async (personId: string) => {
    try {
      await link.mutateAsync({ personId, userId: user.id });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };
  const dismiss = () => {
    writeDismissed(user.id);
    setDismissed(true);
  };

  return (
    <Card>
      <div className="flex items-start gap-3" data-testid="which-one-is-you">
        <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-navy" aria-hidden />
        <div className="min-w-0 flex-1 space-y-3">
          {suggestion ? (
            <>
              <p className="text-sm text-gray-700">
                Is this you? <strong>{suggestion.name}</strong>
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => linkTo(suggestion.id)}
                  disabled={link.isPending}
                  data-testid="which-one-is-you-yes"
                >
                  Yes, that's me
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPicking(true)}
                  data-testid="which-one-is-you-not-me"
                >
                  Not me
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-700">
                Which one is you? Linking yourself lets the assistant know who your family is.
              </p>
              <div className="flex gap-2">
                <select
                  aria-label="You are"
                  value={picked}
                  onChange={(e) => setPicked(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  data-testid="which-one-is-you-select"
                >
                  <option value="">Choose a person…</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => linkTo(picked)}
                  disabled={!picked || link.isPending}
                  data-testid="which-one-is-you-link"
                >
                  That's me
                </Button>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Dismiss"
          data-testid="which-one-is-you-dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}
