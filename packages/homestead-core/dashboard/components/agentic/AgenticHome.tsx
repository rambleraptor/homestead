/**
 * The home screen with the assistant front and centre (behind the
 * `dashboard.agentic_home` flag): the day's briefing, a carousel of the widgets
 * that matter right now, and a conversation in place of the widget stack.
 *
 *  - The briefing is composed here from each widget's one-line summary — no
 *    model call on page load, so the page is instant and free.
 *  - The carousel is the widgets the person pinned (their dashboard settings)
 *    plus any whose summary says it's urgent, urgent first; a pinned widget
 *    with nothing to say drops out, so the strip never shows empty cards.
 *  - The conversation starts fresh on every visit and stays here as it grows;
 *    it is a stored conversation like any other, one tap from the Chat screen.
 */

import { Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import { getAllDashboardWidgets, getAppById } from '@rambleraptor/homestead-core/apps/registry';
import { getLazyComponent } from '@rambleraptor/homestead-core/apps/lazy';
import { resolveDashboardWidgets } from '@rambleraptor/homestead-core/settings/utils/resolveDashboardWidgets';
import { useConversation } from '@rambleraptor/homestead-core/chat/hooks/useConversation';
import { ChatThread } from '@rambleraptor/homestead-core/chat/components/ChatThread';
import { availableStarters } from '@rambleraptor/homestead-core/chat/starters';
import { useGreeting } from '../../greeting';
import { useWidgetSummaries } from './WidgetSummaries';

/** The dashboard's own way into chat; redundant when the chat *is* the home. */
const ASK_WIDGET_ID = 'chat-ask';

/** At most this many headlines make the briefing line. */
const BRIEFING_LINES = 3;

const EMPTY = {
  title: 'What can I do for you?',
  description: 'Ask about anything in your household, or have me change it.',
};

export function AgenticHome() {
  const { user } = useAuth();
  const { greeting } = useGreeting();
  const isVisible = useAppVisible();

  // Fresh every visit: the id lives in component state, so a remount starts a
  // new conversation. The old ones are in the Chat screen's list.
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chat = useConversation(conversationId, { onCreated: setConversationId });

  const widgets = useMemo(
    () =>
      getAllDashboardWidgets().filter((w) => {
        if (w.id === ASK_WIDGET_ID) return false;
        const app = getAppById(w.appId);
        return app ? isVisible(app) : false;
      }),
    [isVisible],
  );
  const { summaries, probes } = useWidgetSummaries(widgets);

  const pinned = resolveDashboardWidgets(widgets, user?.dashboard_widget_order, user?.dashboard_hidden_widgets);
  const urgent = widgets.filter((w) => summaries.get(w.id)?.urgent);
  const isUrgent = (id: string) => urgent.some((w) => w.id === id);
  const carousel = [
    ...urgent,
    // A widget whose summary says "nothing" stays off the strip; one with no
    // summary hook (or one still loading) shows when pinned.
    ...pinned.filter((w) => !isUrgent(w.id) && summaries.get(w.id) !== null),
  ];
  const briefing = [...urgent, ...widgets.filter((w) => !isUrgent(w.id))]
    .map((w) => summaries.get(w.id)?.headline)
    .filter((h): h is string => !!h)
    .slice(0, BRIEFING_LINES)
    .join(' · ');

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4" data-testid="agentic-home">
      {probes}
      <header>
        <h1 className="font-display text-2xl text-text-main">{greeting}</h1>
        <p className="font-body text-text-muted" data-testid="agentic-briefing">
          {briefing || "Here's what's happening"}
        </p>
      </header>

      {carousel.length > 0 && (
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
          data-testid="agentic-carousel"
        >
          {carousel.map((w) => {
            const Widget = getLazyComponent(w.component);
            return (
              <div
                key={w.id}
                className="w-[85%] shrink-0 snap-start sm:w-80"
                data-testid={`agentic-card-${w.id}`}
                data-urgent={isUrgent(w.id) ? 'true' : undefined}
              >
                <Suspense fallback={null}>
                  <Widget />
                </Suspense>
              </div>
            );
          })}
        </div>
      )}

      <ChatThread
        chat={chat}
        conversationId={conversationId}
        starters={availableStarters()}
        empty={EMPTY}
        placeholder="Ask Homestead…"
        className="flex"
      />
      {conversationId && (
        <Link
          to={`/chat/${conversationId}`}
          className="self-end text-sm text-text-muted hover:text-text-main"
          data-testid="agentic-open-chat"
        >
          Open in Chat <ArrowUpRight className="inline size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
