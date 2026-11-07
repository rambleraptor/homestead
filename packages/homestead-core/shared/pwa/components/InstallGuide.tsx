/**
 * The install guide: on an app's page opened with `?install` (from the app
 * drawer's "Add to Home Screen"), one dialog with the step this browser needs
 * to put *this* app on the Home Screen — see `../install.ts`.
 *
 * The parameter is dropped from the address as soon as it's read, so the
 * address the browser saves for the new icon is the app's own.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Share, SquarePlus } from 'lucide-react';
import { getAllApps } from '../../../apps/registry';
import { buildRouteEntries, matchRoute } from '../../../apps/router/match';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { toHomeScreenApp, type HomeScreenApp } from '../appManifest';
import { INSTALL_PARAM, isIOS, isStandaloneDisplay, useInstallPrompt } from '../install';

export function InstallGuide() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const entries = useMemo(() => buildRouteEntries(getAllApps()), []);
  const [app, setApp] = useState<HomeScreenApp | null>(null);
  const prompt = useInstallPrompt();

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (!params.has(INSTALL_PARAM)) return;
    params.delete(INSTALL_PARAM);
    const rest = params.toString();
    navigate(`${pathname}${rest ? `?${rest}` : ''}`, { replace: true });
    // Inside an installed app there's no browser step to show.
    if (isStandaloneDisplay()) return;
    const slug = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    const match = matchRoute(slug, entries);
    setApp(match ? toHomeScreenApp(match.app) : null);
  }, [pathname, search, navigate, entries]);

  if (!app) return null;
  const close = () => setApp(null);

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-sm" data-testid="install-guide">
        <DialogHeader className="items-center text-center">
          <img
            src={app.iconHref}
            alt=""
            className="mb-2 h-16 w-16 rounded-2xl shadow-sm"
          />
          <DialogTitle>Add {app.name} to your Home Screen</DialogTitle>
          <DialogDescription>
            It opens straight into {app.name}, full screen, like any other app.
          </DialogDescription>
        </DialogHeader>

        {prompt.available ? (
          <Button
            className="w-full"
            onClick={() => void prompt.install().finally(close)}
            data-testid="install-guide-install"
          >
            Install {app.name}
          </Button>
        ) : isIOS() ? (
          <ol className="space-y-3 font-body text-sm text-text-main" data-testid="install-guide-ios">
            <li className="flex items-center gap-3">
              <Step n={1} />
              <span>
                Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> Share
                in the browser&apos;s toolbar.
              </span>
            </li>
            <li className="flex items-center gap-3">
              <Step n={2} />
              <span>
                Choose <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden />{' '}
                <strong>Add to Home Screen</strong> (scroll down if you don&apos;t see it).
              </span>
            </li>
            <li className="flex items-center gap-3">
              <Step n={3} />
              <span>
                Tap <strong>Add</strong>.
              </span>
            </li>
          </ol>
        ) : (
          <p className="font-body text-sm text-text-main" data-testid="install-guide-other">
            Open your browser&apos;s menu and choose <strong>Install app</strong> or{' '}
            <strong>Add to Home screen</strong>.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-pearl text-xs font-semibold text-brand-navy">
      {n}
    </span>
  );
}
