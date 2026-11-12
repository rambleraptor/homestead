/**
 * "Save from iPhone" for a Homestead behind a login a shortcut can't pass:
 * the shortcut posts to the drop box (a separate public server), and
 * Homestead collects from there about once a minute.
 *
 * Simpler than the direct setup, because the drop box's address carries the
 * key: the shortcut needs one address and one field, no headers. The key is
 * made here in the browser and only its hash is saved, so the address can be
 * shown exactly once.
 */

import { useState } from 'react';
import { Link2, RefreshCw, Trash2 } from 'lucide-react';
import { VisibilityBadge } from '@rambleraptor/homestead-core/permissions/components/VisibilityBadge';
import { VisibilityPicker } from '@rambleraptor/homestead-core/permissions/components/VisibilityPicker';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { boxOf, dropAddress, newDropKey } from '../../dropBox';
import {
  useBookmarkInboxes,
  useCheckInboxNow,
  useCreateBookmarkInbox,
  useDeleteBookmarkInbox,
} from '../../hooks/useBookmarkInboxes';
import { rememberedVisibility } from '../../hooks/useSaveVisibility';
import type { BookmarkInbox, BookmarkVisibility } from '../../types';
import { MakeTheShortcut, Row, SHORTCUT_NAME, Step, shortened } from './parts';

interface DropBoxSetupProps {
  /** The drop box's address, as configured. */
  base: string;
}

export function DropBoxSetup({ base }: DropBoxSetupProps) {
  const createInbox = useCreateBookmarkInbox();
  const [visibility, setVisibility] = useState<BookmarkVisibility>(rememberedVisibility);
  // The address just made — held only here, and gone when the dialog closes.
  const [address, setAddress] = useState<string | null>(null);

  const create = async () => {
    const key = newDropKey();
    try {
      await createInbox.mutateAsync({ name: 'iPhone shortcut', box: await boxOf(key), visibility });
      setAddress(dropAddress(base, key));
    } catch {
      // The global mutation handler toasts the failure; stay here to try again.
    }
  };

  if (address) {
    return (
      <div className="space-y-5 text-sm text-text-main" data-testid="iphone-shortcut">
        <MakeTheShortcut />
        <Step number={2} title="Fill it in like this">
          <div className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-surface-white">
            <Row
              label="URL"
              value={address}
              display={shortened(address, 30)}
              copyable
              testId="iphone-shortcut-url"
            />
            <Row label="Method" value="POST" />
            <Row label="Request Body" value="JSON" />
            <Row label="" name="url" value="Shortcut Input" variable testId="iphone-shortcut-body-url" />
          </div>
          <p className="text-xs text-text-muted">
            Tap the address to copy it. It’s shown only this once. Shared links appear here within a
            minute.
          </p>
        </Step>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setAddress(null)} data-testid="iphone-shortcut-done">
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-sm" data-testid="iphone-shortcut">
      <div className="space-y-4 text-center">
        <p className="text-text-muted">
          Set up once in Apple’s Shortcuts app. Then tap Share → {SHORTCUT_NAME} on any page.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-text-muted">Save links as</span>
          <VisibilityPicker
            singular="bookmark"
            value={visibility}
            onChange={(value) => setVisibility(value as BookmarkVisibility)}
            alwaysLabeled
          />
        </div>
        <Button
          type="button"
          onClick={() => void create()}
          disabled={createInbox.isPending}
          data-testid="iphone-shortcut-create"
        >
          <Link2 className="mr-2 size-4" aria-hidden />
          {createInbox.isPending ? 'Creating…' : 'Create my shortcut address'}
        </Button>
      </div>
      <Inboxes />
    </div>
  );
}

/** How collecting is going, in a few words. */
function statusLine(inbox: BookmarkInbox): { text: string; error: boolean } {
  const status = inbox.sync_status;
  if (status?.state === 'error') {
    return { text: status.last_error || 'Couldn’t reach the drop box', error: true };
  }
  if (status?.last_success_time) {
    const at = new Date(status.last_success_time);
    return {
      text: `Checked ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
      error: false,
    };
  }
  return { text: 'Not checked yet', error: false };
}

/** The shortcuts already set up: check one now, or remove it (which stops its address working). */
function Inboxes() {
  const toast = useToast();
  const inboxes = useBookmarkInboxes();
  const deleteInbox = useDeleteBookmarkInbox();
  const checkNow = useCheckInboxNow();

  if (inboxes.isError) {
    return (
      <QueryError
        compact
        error={inboxes.error}
        onRetry={() => void inboxes.refetch()}
        title="Couldn’t load your shortcuts"
      />
    );
  }
  const list = inboxes.data ?? [];
  if (list.length === 0) return null;

  const check = async (inbox: BookmarkInbox) => {
    try {
      await checkNow.mutateAsync(inbox.id);
      toast.success('Checking for new links');
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <section aria-label="Your shortcuts" className="border-t border-gray-200 pt-4">
      <h3 className="pb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Your shortcuts</h3>
      <ul className="divide-y divide-gray-100">
        {list.map((inbox) => {
          const status = statusLine(inbox);
          return (
            <li key={inbox.id} className="flex items-center gap-2 py-2" data-testid="iphone-inbox">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium text-text-main">{inbox.name}</span>
                  <VisibilityBadge singular="bookmark" record={{ visibility: inbox.visibility }} showShared />
                </div>
                <p
                  className={status.error ? 'truncate text-xs text-red-600' : 'truncate text-xs text-text-muted'}
                  data-testid="iphone-inbox-status"
                >
                  Added {new Date(inbox.create_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  {' · '}
                  {status.text}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void check(inbox)}
                disabled={checkNow.isPending}
                data-testid="iphone-inbox-check"
              >
                <RefreshCw className="mr-1 size-4" aria-hidden />
                Check now
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${inbox.name}`}
                className="text-red-600 hover:text-red-700"
                onClick={() => deleteInbox.mutate(inbox.id)}
                data-testid="iphone-inbox-remove"
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
