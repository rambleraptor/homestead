/**
 * "Add to your Home Screen" on the app drawer: every app the person can use
 * that has its own Home Screen icon, each one tap from being added.
 *
 * Adding happens in the browser, on the app's own page (`shared/pwa/install.ts`
 * says why), so a tap goes there — and from an app already on the Home Screen
 * that means leaving it: on iOS the address is handed to Safari; elsewhere it
 * opens in the browser. Because that hand-off can't be confirmed, a dialog
 * follows it with the address to copy in case nothing opened.
 */

import { useState } from 'react';
import { Copy, SquarePlus } from 'lucide-react';
import type { SidebarEntry } from '@rambleraptor/homestead-core/apps/sidebarPins';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@rambleraptor/homestead-core/shared/components/ui/dialog';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import {
  toHomeScreenApp,
  type HomeScreenApp,
} from '@rambleraptor/homestead-core/shared/pwa/appManifest';
import {
  installPageUrl,
  isIOS,
  isStandaloneDisplay,
  safariUrl,
} from '@rambleraptor/homestead-core/shared/pwa/install';

interface HomeScreenAppsProps {
  entries: readonly SidebarEntry[];
  /** The drawer's search, applied here too. */
  query?: string;
}

export function HomeScreenApps({ entries, query = '' }: HomeScreenAppsProps) {
  const toast = useToast();
  const [handoff, setHandoff] = useState<{ app: HomeScreenApp; url: string } | null>(null);
  const standalone = isStandaloneDisplay();
  const ios = isIOS();

  const q = query.trim().toLowerCase();
  const apps = entries
    .map((entry) => toHomeScreenApp(entry.app))
    .filter((app): app is HomeScreenApp => app !== null)
    .filter((app) => !q || app.name.toLowerCase().includes(q));
  if (apps.length === 0) return null;

  const add = (app: HomeScreenApp) => {
    const url = installPageUrl(app.basePath, window.location.origin);
    if (!standalone) {
      // A full load, so the server writes this app's manifest into the head
      // before the browser decides what it would install.
      window.location.assign(url);
      return;
    }
    if (ios) window.location.href = safariUrl(url);
    else window.open(url, '_blank', 'noopener');
    setHandoff({ app, url });
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied — paste it into Safari.');
    } catch {
      toast.error('Could not copy — select the link above and copy it.');
    }
  };

  const browser = ios ? 'Safari' : 'your browser';

  return (
    <section aria-labelledby="home-screen-apps" className="space-y-3" data-testid="app-drawer-home-screen">
      <div className="px-1">
        <h2 id="home-screen-apps" className="text-base font-semibold text-brand-navy">
          Add to your Home Screen
        </h2>
        <p className="font-body text-sm text-text-muted">
          {standalone
            ? `Each app can have its own icon. You'll finish in ${browser} — only a browser can add icons.`
            : 'Each app can have its own icon that opens straight into it.'}
        </p>
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
        {apps.map((app) => (
          <li
            key={app.id}
            className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-surface-white p-3 text-center shadow-sm"
          >
            <img src={app.iconHref} alt="" className="h-12 w-12 rounded-xl" />
            <span className="truncate font-body text-sm font-medium text-brand-slate">{app.name}</span>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5"
              aria-label={`Add ${app.name} to your Home Screen`}
              onClick={() => add(app)}
              data-testid={`home-screen-add-${app.id}`}
            >
              <SquarePlus className="h-4 w-4" aria-hidden />
              Add
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={handoff !== null} onOpenChange={(open) => !open && setHandoff(null)}>
        {handoff && (
          <DialogContent className="max-w-sm" data-testid="home-screen-handoff">
            <DialogHeader>
              <DialogTitle>Finish in {browser}</DialogTitle>
              <DialogDescription>
                {browser === 'Safari' ? 'Safari' : 'Your browser'} opens {handoff.app.name}&apos;s
                page with the next step. If it didn&apos;t open, copy the link and paste it into{' '}
                {browser}.
              </DialogDescription>
            </DialogHeader>
            <p className="select-all break-all rounded-lg bg-bg-pearl px-3 py-2 font-mono text-xs text-text-main">
              {handoff.url}
            </p>
            <Button
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => void copy(handoff.url)}
              data-testid="home-screen-copy-link"
            >
              <Copy className="h-4 w-4" aria-hidden />
              Copy link
            </Button>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
