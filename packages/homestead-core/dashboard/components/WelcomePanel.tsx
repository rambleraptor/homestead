/**
 * First-login getting-started panel, on the classic dashboard.
 *
 * Shown to members (admins get {@link AdminChecklistPanel}) while the per-user `dashboard.show_welcome_guide`
 * setting is truthy — it defaults to `true`, so a brand-new user sees it on
 * their first visit, and the "Got it" button flips it to `false` so it never
 * returns unless the user re-enables it from Settings.
 *
 * The next-step links are derived from the apps the viewer can actually see
 * (via {@link useAppVisible}), so we never point a user at a feature that's
 * disabled or hidden from them. The assistant isn't one of them: the Ask box
 * is right below on the same page.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { useUserSetting } from '@rambleraptor/homestead-core/user-settings/hooks/useUserSetting';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import {
  getAppById,
  getNavigationApps,
} from '@rambleraptor/homestead-core/apps/registry';

interface WelcomeLink {
  key: string;
  label: string;
  to: string;
  testid: string;
}

export function WelcomePanel() {
  const { value, setValue, isLoading, isSaving } = useUserSetting<boolean>(
    'dashboard',
    'show_welcome_guide',
  );
  const isVisible = useAppVisible();

  // Build the next-step links from apps the viewer can actually reach. Recomputed
  // when visibility changes (e.g. permissions hydrate after login).
  const links = useMemo<WelcomeLink[]>(() => {
    const out: WelcomeLink[] = [];

    // Highlight a real feature app to explore first — the first visible app in
    // the nav that isn't one of the always-present shells.
    const featured = getNavigationApps().find(
      (app) =>
        !['dashboard', 'settings', 'chat'].includes(app.id) &&
        !!app.web?.basePath &&
        isVisible(app),
    );
    if (featured?.web?.basePath) {
      out.push({
        key: 'explore',
        label: `Explore ${featured.name}`,
        to: featured.web.basePath,
        testid: 'welcome-link-explore',
      });
    }


    const settings = getAppById('settings');
    if (settings?.web?.basePath && isVisible(settings)) {
      out.push({
        key: 'settings',
        label: 'Set your preferences',
        to: settings.web.basePath,
        testid: 'welcome-link-settings',
      });
    }

    return out;
  }, [isVisible]);

  // Render nothing until we know the setting, so the panel never flashes for a
  // returning user who has already dismissed it.
  if (isLoading || value === false) return null;

  return (
    <Card
      className="border-accent-terracotta/30 bg-accent-terracotta/5"
      data-testid="welcome-panel"
    >
      <div className="flex items-start gap-4">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-terracotta/15 text-accent-terracotta">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex-1 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-gray-900">
              Welcome to Homestead
            </h2>
            <p className="text-sm text-gray-600">
              This is your household's home base. Your apps live in the sidebar,
              and this dashboard gathers highlights from each of them. Here are a
              few places to start.
            </p>
          </div>

          {links.length > 0 && (
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link.key}>
                  <Link
                    to={link.to}
                    data-testid={link.testid}
                    className="group inline-flex items-center gap-1.5 text-sm font-medium text-accent-terracotta hover:underline"
                  >
                    {link.label}
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div>
            <Button
              size="sm"
              onClick={() => void setValue(false)}
              disabled={isSaving}
              data-testid="welcome-dismiss"
            >
              Got it
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
