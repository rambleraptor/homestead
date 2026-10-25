/**
 * The home's notice for an instance (or a person) with no apps to show.
 *
 * Two situations leave the dashboard blank, and each gets its own message:
 *
 * - No feature apps are installed at all (a fresh project with an empty
 *   `apps` array and nothing under `apps/`). The admin is told how to add
 *   one; everyone else is told the admin hasn't set any up yet.
 * - Apps are installed, but none are visible to this viewer (the admin
 *   hasn't shared any with them). They're pointed at their admin.
 *
 * Unlike the setup checklist, this panel isn't dismissable: it reflects the
 * live state of the instance and disappears on its own once an app shows up.
 */

import type { ReactNode } from 'react';
import { ExternalLink, PackagePlus } from 'lucide-react';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { getFeatureApps } from '@rambleraptor/homestead-core/apps/core-apps';

const QUICK_START_URL = 'https://myhomestead.dev/guides/quick-start';
const EXAMPLE_APPS_URL = 'https://myhomestead.dev/guides/apps';

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800">
      {children}
    </code>
  );
}

function DocsLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-accent-terracotta hover:underline"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}

export function NoAppsPanel() {
  const { user } = useAuth();
  const isVisible = useAppVisible();

  const installed = getFeatureApps();
  if (installed.length > 0 && installed.some(isVisible)) return null;

  const isSuperuser = user?.type === 'superuser';
  const nothingInstalled = installed.length === 0;

  let title: string;
  let body: ReactNode;
  if (nothingInstalled && isSuperuser) {
    title = 'Add your first app';
    body = (
      <>
        <p className="text-sm text-gray-600">
          Apps are what fill this dashboard and the sidebar, and this instance
          doesn't have any yet. Scaffold one from your project directory:
        </p>
        <pre
          className="overflow-x-auto rounded-md bg-gray-900 px-4 py-3 font-mono text-xs text-gray-100"
          data-testid="no-apps-scaffold-command"
        >
          homestead init-app my-app
        </pre>
        <p className="text-sm text-gray-600">
          Anything under <Code>apps/</Code> is picked up on the next start. To
          install one of the ready-made apps instead, add it to the{' '}
          <Code>apps</Code> array in <Code>homestead.config.ts</Code>.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <DocsLink href={QUICK_START_URL}>Read the quick start</DocsLink>
          <DocsLink href={EXAMPLE_APPS_URL}>Browse the example apps</DocsLink>
        </div>
      </>
    );
  } else if (nothingInstalled) {
    title = 'No apps yet';
    body = (
      <p className="text-sm text-gray-600">
        Your household's admin hasn't added any apps to this Homestead yet.
        Once they do, the apps will show up in the sidebar and their highlights
        will gather here.
      </p>
    );
  } else {
    title = 'Nothing shared with you yet';
    body = (
      <p className="text-sm text-gray-600">
        This Homestead has apps installed, but none have been shared with you.
        Ask your household's admin to give you access to one.
      </p>
    );
  }

  return (
    <Card
      className="border-dashed border-gray-300 bg-surface-white"
      data-testid="no-apps-panel"
    >
      <div className="flex items-start gap-4">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
          <PackagePlus className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex-1 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {body}
        </div>
      </div>
    </Card>
  );
}
