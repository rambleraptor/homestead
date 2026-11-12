/**
 * "Save from iPhone" for a Homestead a phone can reach directly: the shortcut
 * posts to Homestead's own API, signed in with a personal access token that
 * reaches only bookmarks.
 *
 * Two short screens. First, one button: make the key. Then the recipe: three
 * taps in Shortcuts, and a picture of the one action to fill in, where tapping
 * a value copies it.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { VisibilityPicker } from '@rambleraptor/homestead-core/permissions/components/VisibilityPicker';
import { useMintPersonalAccessToken } from '@rambleraptor/homestead-core/settings/hooks/useMintPersonalAccessToken';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { rememberedVisibility } from '../../hooks/useSaveVisibility';
import { BOOKMARKS, VISIBILITY_HOUSEHOLD } from '../../resources';
import type { BookmarkVisibility } from '../../types';
import { MakeTheShortcut, Row, SHORTCUT_NAME, Step, shortened } from './parts';

/** Where the shortcut posts: this Homestead's bookmarks collection. */
function bookmarksEndpoint(): string {
  return `${window.location.origin}/api/aep/${BOOKMARKS}`;
}

export function DirectSetup() {
  const toast = useToast();
  const mint = useMintPersonalAccessToken();
  const [key, setKey] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [visibility, setVisibility] = useState<BookmarkVisibility>(rememberedVisibility);

  const createKey = async () => {
    try {
      const result = await mint.mutateAsync({
        name: `${SHORTCUT_NAME} (iPhone shortcut)`,
        // Bookmarks only: the key sits in a shortcut on a phone, so it gets
        // nothing else of what its owner can reach.
        scopes: [{ capability: 'write', target_scope: 'collection', resource_type: 'bookmark' }],
      });
      setKey(result.token);
      setStarted(true);
    } catch (error) {
      // The mint hook opts out of the global mutation toast; show it here.
      toast.error(error);
    }
  };

  if (!started) {
    return (
      <div className="space-y-4 text-center" data-testid="iphone-shortcut">
        <p className="text-sm text-text-muted">
          Set up once in Apple’s Shortcuts app. Then tap Share → {SHORTCUT_NAME} on any page.
        </p>
        <Button
          type="button"
          onClick={() => void createKey()}
          disabled={mint.isPending}
          data-testid="iphone-shortcut-create-key"
        >
          <KeyRound className="mr-2 size-4" aria-hidden />
          {mint.isPending ? 'Creating…' : 'Create my key'}
        </Button>
        <p className="text-xs text-text-muted">
          The key works only for bookmarks.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => setStarted(true)}
            data-testid="iphone-shortcut-have-key"
          >
            I already have one
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-sm text-text-main" data-testid="iphone-shortcut">
      <MakeTheShortcut />

      <Step
        number={2}
        title="Fill it in like this"
        aside={
          <VisibilityPicker
            singular="bookmark"
            value={visibility}
            onChange={(value) => setVisibility(value as BookmarkVisibility)}
            compact
          />
        }
      >
        <div className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-surface-white">
          <Row label="URL" value={bookmarksEndpoint()} copyable testId="iphone-shortcut-url" />
          <Row label="Method" value="POST" />
          <Row
            label="Headers"
            name="Authorization"
            value={key ? `Bearer ${key}` : 'Bearer + your key'}
            display={key ? `Bearer ${shortened(key)}` : undefined}
            copyable={!!key}
            testId="iphone-shortcut-header"
          />
          <Row label="Request Body" value="JSON" />
          <Row label="" name="url" value="Shortcut Input" variable testId="iphone-shortcut-body-url" />
          {visibility === VISIBILITY_HOUSEHOLD && (
            <Row label="" name="visibility" value={VISIBILITY_HOUSEHOLD} copyable testId="iphone-shortcut-body-visibility" />
          )}
        </div>
        <p className="text-xs text-text-muted">
          Tap a value to copy it.{' '}
          {key ? 'Your key is shown only this once. ' : ''}
          <Link to="/settings" className="underline">
            Manage keys
          </Link>
        </p>
      </Step>
    </div>
  );
}
