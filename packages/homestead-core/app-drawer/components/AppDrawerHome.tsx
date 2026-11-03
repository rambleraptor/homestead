/**
 * The app drawer: every app the signed-in person can use, grouped by sidebar
 * section, each card opening the app. The list is the same visibility pass
 * the sidebar runs (`useSidebarPins`), so an app the person isn't granted
 * never appears here, not even greyed out.
 */

import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { AppIcon } from '@rambleraptor/homestead-core/apps/lazy';
import { groupAppsBySection } from '@rambleraptor/homestead-core/apps/sections';
import { useSidebarPins } from '@rambleraptor/homestead-core/apps/useSidebarPins';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';

export function AppDrawerHome() {
  const { visibleApps } = useSidebarPins();
  const sections = groupAppsBySection(visibleApps);

  return (
    <div className="space-y-8" data-testid="app-drawer">
      <PageHeader title="All apps" subtitle="Everything you can use here." />

      {visibleApps.length === 0 ? (
        <Card>
          <p className="text-center text-gray-600 py-8" data-testid="app-drawer-empty">
            No apps have been shared with you yet.
          </p>
        </Card>
      ) : (
        sections.map((section) => (
          <section key={section.name || 'unsectioned'} className="space-y-3">
            {section.name && (
              <h2 className="text-lg font-semibold text-gray-900">{section.name}</h2>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {section.apps.map((app) => {
                const web = app.web;
                if (!web) return null;
                return (
                  <Link
                    key={app.id}
                    to={web.basePath}
                    data-testid={`app-drawer-card-${app.id}`}
                    className="block"
                  >
                    <Card className="h-full transition-colors hover:bg-gray-50">
                      <div className="flex items-start gap-4">
                        <AppIcon
                          icon={web.icon}
                          className="w-6 h-6 text-accent-terracotta mt-1 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900">{app.name}</h3>
                          <p className="mt-1 text-sm text-gray-600">{app.description}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}

      <p className="text-xs text-text-muted">
        Apps you don&apos;t see here haven&apos;t been shared with you.
      </p>
    </div>
  );
}
