import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, KeyRound, Smartphone } from 'lucide-react';
import { VisibilityPicker } from '@rambleraptor/homestead-core/permissions/components/VisibilityPicker';
import { useMintPersonalAccessToken } from '@rambleraptor/homestead-core/settings/hooks/useMintPersonalAccessToken';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { rememberedVisibility } from '../hooks/useSaveVisibility';
import { BOOKMARKS, VISIBILITY_HOUSEHOLD } from '../resources';
import type { BookmarkVisibility } from '../types';

/** What the shortcut is called, in the steps and as the key's name. */
const SHORTCUT_NAME = 'Save to Homestead';

/** Where the shortcut posts: this Homestead's bookmarks collection. */
function bookmarksEndpoint(): string {
  return `${window.location.origin}/api/aep/${BOOKMARKS}`;
}

/** A long secret with its middle left out, for showing (never for copying). */
function shortened(value: string): string {
  return value.length > 28 ? `${value.slice(0, 18)}…${value.slice(-4)}` : value;
}

/**
 * "Save from iPhone": iOS won't let an installed web app appear in the share
 * sheet, so saving from another app there goes through Apple's Shortcuts — a
 * shortcut that posts the shared link to this Homestead.
 *
 * Two short screens. First, one button: make the key the shortcut signs in
 * with (a personal access token that reaches only bookmarks). Then the recipe:
 * three taps in Shortcuts, and a picture of the one action to fill in, where
 * tapping a value copies it.
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
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Save from iPhone">
        {/* Mounted only while open: closing forgets the key, which is shown once. */}
        {open && <ShortcutSetup />}
      </Modal>
    </>
  );
}

function ShortcutSetup() {
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
      <Step number={1} title="In Shortcuts">
        <ul className="space-y-1.5">
          <Tap>
            Tap <strong>+</strong> and name it “{SHORTCUT_NAME}”
          </Tap>
          <Tap>
            Tap <strong>ⓘ</strong> and turn on <strong>Show in Share Sheet</strong>
          </Tap>
          <Tap>
            Add the action <strong>Get Contents of URL</strong>
          </Tap>
        </ul>
      </Step>

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

interface StepProps {
  number: number;
  title: string;
  /** A control beside the title. */
  aside?: ReactNode;
  children: ReactNode;
}

function Step({ number, title, aside, children }: StepProps) {
  return (
    <section className="space-y-2" aria-label={`Step ${number}: ${title}`}>
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
          {number}
        </span>
        <h3 className="font-semibold text-brand-navy">{title}</h3>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function Tap({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

interface RowProps {
  /** The setting's name in the action, on the left. Empty for a further row of the one above. */
  label: string;
  /** A key within the setting (a header's name, a body field's). */
  name?: string;
  value: string;
  /** What to show instead of `value` when it is too long to read. */
  display?: string;
  /** Tapping the row copies `value`. */
  copyable?: boolean;
  /** A Shortcuts variable to pick, not text to type: drawn as a token. */
  variable?: boolean;
  testId?: string;
}

/**
 * One line of the action as Shortcuts lays it out. A copyable row is a button:
 * the whole line is the target, so it works with a thumb.
 */
function Row({ label, name, value, display, copyable = false, variable = false, testId }: RowProps) {
  const toast = useToast();
  // The full value, selectable, once copying has failed: the only way left to take it.
  const [spelledOut, setSpelledOut] = useState(false);
  const what = name ?? label;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied`);
    } catch {
      setSpelledOut(true);
      toast.error('Couldn’t copy. Press and hold the text to copy it.');
    }
  };

  const content = (
    <>
      <span className="w-20 shrink-0 text-text-muted sm:w-28">{label}</span>
      {name && <span className="shrink-0 font-medium">{name}</span>}
      <span
        className={cn(
          'min-w-0 flex-1 text-right',
          spelledOut ? 'select-all break-all' : 'truncate',
          variable
            ? 'flex justify-end'
            : copyable
              ? 'font-mono text-xs text-brand-navy'
              : 'font-medium',
        )}
        data-testid={testId}
        data-value={value}
      >
        {variable ? (
          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">{value}</span>
        ) : spelledOut ? (
          value
        ) : (
          display ?? value
        )}
      </span>
      {copyable && <Copy className="size-4 shrink-0 text-text-muted" aria-hidden />}
    </>
  );

  const layout = 'flex min-h-11 w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm sm:gap-3';
  if (!copyable) return <div className={layout}>{content}</div>;
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy ${what}`}
      className={cn(layout, 'hover:bg-gray-50 active:bg-gray-100')}
      data-testid={testId ? `${testId}-copy` : undefined}
    >
      {content}
    </button>
  );
}
