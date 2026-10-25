/**
 * Dashboard Home Component
 *
 * Renders a stack of widgets contributed by other apps. Apps
 * declare widgets via `AppConfig.widgets`; the dashboard discovers
 * them through `getAllDashboardWidgets()`, then defers to the user's
 * own dashboard preferences (saved via the settings UI) for the
 * order and visibility of each widget.
 */

import { Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { useAiConfigured } from '@rambleraptor/homestead-core/chat/hooks/useAiConfigured';
import { CHAT_APP_ID } from '@rambleraptor/homestead-core/chat/hooks/useConversations';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { getTodaysHoliday } from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { resolveDashboardWidgets } from '@rambleraptor/homestead-core/settings/utils/resolveDashboardWidgets';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { getAllDashboardWidgets, getAppById } from '@rambleraptor/homestead-core/apps/registry';
import { getLazyComponent } from '@rambleraptor/homestead-core/apps/lazy';
import { useUserSetting } from '@rambleraptor/homestead-core/user-settings/hooks/useUserSetting';
import { useAppFlag } from '@rambleraptor/homestead-core/settings/hooks/useAppFlag';
import { AgenticHome } from './agentic/AgenticHome';
import { WelcomePanel } from './WelcomePanel';
import { AdminChecklistPanel } from './AdminChecklistPanel';
import { NoAppsPanel } from './NoAppsPanel';

/** `/dashboard`, and `/dashboard/c/:id` (a conversation on the agentic home). */
export function DashboardHome({ params }: AppRouteProps) {
  const conversationId = params?.id ?? null;
  // Behind a flag whose audience can be one group, so the assistant-first
  // home can be tried by a few people while everyone else keeps this one.
  const agentic = useAppFlag<boolean>('dashboard', 'agentic_home');
  // The assistant-first home is only for someone the assistant can serve: an
  // AI provider configured, and Chat among the apps they can use. Anyone else
  // gets the classic dashboard rather than a text bar that can only fail.
  const configured = useAiConfigured();
  const isVisible = useAppVisible();
  const chatApp = getAppById(CHAT_APP_ID);
  const canChat = !!chatApp && isVisible(chatApp);

  if (agentic.value === true && canChat) {
    // Still asking the server: show neither home rather than flash the wrong one.
    if (configured === undefined) return null;
    if (configured) return <AgenticHome conversationId={conversationId} />;
  }
  if (conversationId) {
    // Until the flag has loaded it reads as off: wait rather than send a
    // conversation on the agentic home away to the Chat screen on a reload.
    if (agentic.isLoading) return null;
    // The classic dashboard holds no conversation; one in the address is Chat's.
    return <Navigate to={`/chat/${conversationId}`} replace />;
  }
  return <ClassicHome />;
}

function ClassicHome() {
  const { user } = useAuth();
  const isVisible = useAppVisible();
  const todaysHoliday = getTodaysHoliday();
  // Superusers get a setup checklist in place of the generic welcome guide.
  const isSuperuser = user?.type === 'superuser';
  // While the welcome guide is still showing, this is (almost certainly) a
  // first visit — greet the user rather than welcoming them "back".
  const { value: showWelcomeGuide } = useUserSetting<boolean>(
    'dashboard',
    'show_welcome_guide',
  );
  const isFirstRun = showWelcomeGuide !== false;
  // Filter out widgets contributed by apps the viewer can't access — otherwise a
  // user could see a Recipes widget while the Recipes app itself is hidden from
  // their sidebar.
  const accessibleWidgets = getAllDashboardWidgets().filter((w) => {
    const app = getAppById(w.appId);
    return app ? isVisible(app) : false;
  });
  const widgets = resolveDashboardWidgets(
    accessibleWidgets,
    user?.dashboard_widget_order,
    user?.dashboard_hidden_widgets,
  );

  const returningGreeting = user?.name
    ? `Welcome back, ${user.name}`
    : 'Welcome back';
  const firstRunGreeting = user?.name ? `Welcome, ${user.name}` : 'Welcome';
  const greeting = todaysHoliday
    ? todaysHoliday.message
    : isFirstRun
    ? firstRunGreeting
    : returningGreeting;

  return (
    <div className="space-y-6">
      <PageHeader title={greeting} subtitle="Here's what's happening" />

      <div className="max-w-3xl space-y-6">
        {isSuperuser ? <AdminChecklistPanel /> : <WelcomePanel />}
        <NoAppsPanel />
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
