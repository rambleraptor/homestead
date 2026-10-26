/**
 * The classic dashboard, for the `dashboard.classic_home` flag's audience: a
 * greeting, the getting-started panel, an Ask box into a new conversation, and
 * the stack of widgets other apps contribute, in the order and visibility the
 * person chose in their dashboard settings.
 */

import { Suspense } from 'react';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { resolveDashboardWidgets } from '@rambleraptor/homestead-core/settings/utils/resolveDashboardWidgets';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { getAllDashboardWidgets, getAppById } from '@rambleraptor/homestead-core/apps/registry';
import { getLazyComponent } from '@rambleraptor/homestead-core/apps/lazy';
import { useGreeting } from '../greeting';
import { AdminChecklistPanel } from './AdminChecklistPanel';
import { AskBox } from './AskBox';
import { NoAppsPanel } from './NoAppsPanel';
import { WelcomePanel } from './WelcomePanel';

export function ClassicHome() {
  const { user } = useAuth();
  const greeting = useGreeting();
  const isVisible = useAppVisible();
  // Only widgets from apps the viewer can reach — otherwise a Recipes widget
  // could show while the Recipes app itself is hidden from them.
  const accessibleWidgets = getAllDashboardWidgets().filter((w) => {
    const app = getAppById(w.appId);
    return app ? isVisible(app) : false;
  });
  const widgets = resolveDashboardWidgets(
    accessibleWidgets,
    user?.dashboard_widget_order,
    user?.dashboard_hidden_widgets,
  );

  return (
    <div className="space-y-6" data-testid="classic-home">
      <PageHeader title={greeting} subtitle="Here's what's happening" />

      <div className="max-w-3xl space-y-6">
        {user?.type === 'superuser' ? <AdminChecklistPanel /> : <WelcomePanel />}
        <NoAppsPanel />
        <AskBox />
        {widgets.map(({ id, component }) => {
          const Widget = getLazyComponent(component);
          return (
            <Suspense key={id} fallback={null}>
              <Widget />
            </Suspense>
          );
        })}
      </div>
    </div>
  );
}
