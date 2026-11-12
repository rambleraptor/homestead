import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Copy, KeyRound, Smartphone } from 'lucide-react';
import { VisibilityPicker } from '@rambleraptor/homestead-core/permissions/components/VisibilityPicker';
import { useMintPersonalAccessToken } from '@rambleraptor/homestead-core/settings/hooks/useMintPersonalAccessToken';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { rememberedVisibility } from '../hooks/useSaveVisibility';
import { BOOKMARKS, VISIBILITY_HOUSEHOLD } from '../resources';
import type { BookmarkVisibility } from '../types';

/** What the shortcut is called, in the steps and as the key's name. */
const SHORTCUT_NAME = 'Save to Homestead';

/** Where the shortcut posts: this Homestead's bookmarks collection. */
function bookmarksEndpoint(): string {
  return `${window.location.origin}/api/aep/${BOOKMARKS}`;
}

/**
 * "Save from iPhone": iOS won't let an installed web app appear in the share
 * sheet, so saving from another app there goes through Apple's Shortcuts — a
 * shortcut that posts the shared link to this Homestead. This walks through
 * making one, with every value it needs ready to copy, and makes the key it
 * signs in with: a personal access token that can only reach bookmarks.
 */
export function IphoneShortcut() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="iphone-shortcut-open"
      >
        <Smartphone className="mr-1 size-4" aria-hidden />
        Save from iPhone
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Save from your iPhone’s share sheet">
        {/* Mounted only while open: closing forgets the key, which is shown once. */}
        {open && <ShortcutSteps />}
      </Modal>
    </>
  );
}

function ShortcutSteps() {
  const toast = useToast();
  const mint = useMintPersonalAccessToken();
  const [key, setKey] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<BookmarkVisibility>(rememberedVisibility);
  const forFamily = visibility === VISIBILITY_HOUSEHOLD;

  const createKey = async () => {
    try {
      const result = await mint.mutateAsync({
        name: `${SHORTCUT_NAME} (iPhone shortcut)`,
        // Bookmarks only: the key sits in a shortcut on a phone, so it gets
        // nothing else of what its owner can reach.
        scopes: [{ capability: 'write', target_scope: 'collection', resource_type: 'bookmark' }],
      });
      setKey(result.token);
    } catch (error) {
      // The mint hook opts out of the global mutation toast; show it here.
      toast.error(error);
    }
  };

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Couldn’t copy — press and hold the text to copy it instead.');
    }
  };

  const header = `Bearer ${key ?? '(your key from step 1)'}`;

  return (
    <div className="space-y-5 text-sm text-text-main" data-testid="iphone-shortcut">
      <p className="text-text-muted">
        An iPhone can’t share straight to Homestead, so this uses Apple’s Shortcuts app. Set it up once
        on the phone; after that, Share → {SHORTCUT_NAME} saves the page you’re on.
      </p>

      <Step number={1} title="Create a key for the shortcut">
        {key ? (
          <>
            <Value label="Key" value={key} onCopy={copy} testId="iphone-shortcut-key" />
            <p className="text-text-muted">
              Copy it now — it’s shown only this once. It can save and read bookmarks as you, and nothing
              else. Remove it any time under{' '}
              <Link to="/settings" className="underline">
                Settings → Personal Access Tokens
              </Link>
              .
            </p>
          </>
        ) : (
          <>
            <p className="text-text-muted">
              The shortcut signs in with a key of its own, which can only reach bookmarks.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => void createKey()}
              disabled={mint.isPending}
              data-testid="iphone-shortcut-create-key"
            >
              <KeyRound className="mr-1 size-4" aria-hidden />
              {mint.isPending ? 'Creating…' : 'Create a key'}
            </Button>
          </>
        )}
      </Step>

      <Step number={2} title="Make the shortcut">
        <ol className="list-decimal space-y-1 pl-5 text-text-muted">
          <li>
            Open <strong>Shortcuts</strong>, tap <strong>+</strong>, and name it “{SHORTCUT_NAME}”.
          </li>
          <li>
            Open its details (the <strong>ⓘ</strong> button) and turn on <strong>Show in Share Sheet</strong>.
            Let it receive <strong>URLs</strong> and <strong>Safari web pages</strong>.
          </li>
          <li>
            Add the action <strong>Get Contents of URL</strong>, and tap its arrow to show more.
          </li>
        </ol>
      </Step>

      <Step number={3} title="Fill in the action">
        <Value label="URL" value={bookmarksEndpoint()} onCopy={copy} testId="iphone-shortcut-url" />
        <Fixed label="Method" value="POST" />
        <Value
          label="Headers → Authorization"
          value={header}
          onCopy={key ? copy : undefined}
          testId="iphone-shortcut-header"
        />
        <Fixed label="Request Body" value="JSON" />
        <Fixed label="Body field: url (Text)" value="Shortcut Input" testId="iphone-shortcut-body-url" />
        {forFamily && (
          <Fixed label="Body field: visibility (Text)" value={VISIBILITY_HOUSEHOLD} testId="iphone-shortcut-body-visibility" />
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-text-muted">Links saved this way are</span>
          <VisibilityPicker singular="bookmark" value={visibility} onChange={(v) => setVisibility(v as BookmarkVisibility)} />
        </div>
        <p className="text-text-muted">
          {forFamily
            ? 'For the family: add the visibility field above. Leave it out for a shortcut that saves privately.'
            : 'Private needs nothing more. For a shortcut that saves for the family, choose Family to see the extra field.'}
        </p>
      </Step>

      <Step number={4} title="Try it">
        <p className="text-text-muted">
          In Safari, tap Share and choose {SHORTCUT_NAME}. The page appears here a moment later. The phone
          has to be able to reach this address, so away from home it needs the same access you use to open
          Homestead.
        </p>
      </Step>
    </div>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2" aria-label={`Step ${number}: ${title}`}>
      <h3 className="flex items-center gap-2 font-semibold text-brand-navy">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs text-white">
          {number}
        </span>
        {title}
      </h3>
      <div className="space-y-2 pl-8">{children}</div>
    </section>
  );
}

interface ValueProps {
  label: string;
  value: string;
  /** Leave out for a value that isn't ready to copy yet. */
  onCopy?: (value: string, what: string) => void;
  testId: string;
}

/** A value to paste into the shortcut, with a copy button. */
function Value({ label, value, onCopy, testId }: ValueProps) {
  return (
    <div>
      <div className="text-xs font-medium text-text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <code
          className="min-w-0 flex-1 select-all break-all rounded-md bg-gray-100 px-2 py-1.5 text-xs"
          data-testid={testId}
        >
          {value}
        </code>
        {onCopy && (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Copy ${label}`}
            onClick={() => onCopy(value, label)}
            data-testid={`${testId}-copy`}
          >
            <Copy className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

/** A setting to choose in the shortcut rather than paste. */
function Fixed({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <span className="font-medium" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
