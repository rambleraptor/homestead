import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Card } from './Card';
import { PageHeader } from './PageHeader';
import { AppIcon } from '@rambleraptor/homestead-core/apps/lazy';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { appBasePath } from '@rambleraptor/homestead-core/apps/paths';
import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

interface Props {
  app: AppConfig;
}

/**
 * Generic landing page for a parent app that declares `children`.
 * Renders one card per child the current viewer can use — children
 * whose `enabled` flag excludes them are filtered out so the landing
 * page stays consistent with the rest of the gating surface. The
 * test-id convention `${parent.id}-link-${child.id}` matches the ids
 * used by the hand-written landings this component replaces.
 */
export function NestedAppLanding({ app }: Props) {
  const isVisible = useAppVisible();
  const children = (app.children ?? []).filter(isVisible);

  return (
    <div className="space-y-6">
      <PageHeader title={app.name} subtitle={app.description} />

      <div className="grid gap-3 sm:grid-cols-2">
        {children.map((child) => {
          const web = child.web;
          if (!web) return null;
          return (
            <Link
              key={child.id}
              to={appBasePath(child)}
              data-testid={`${app.id}-link-${child.id}`}
              className="block"
            >
              <Card className="h-full transition-colors hover:bg-gray-50">
                <div className="flex items-start gap-4">
                  <AppIcon
                    icon={web.icon}
                    className="w-6 h-6 text-accent-terracotta mt-1 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900">{child.name}</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {child.description}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
