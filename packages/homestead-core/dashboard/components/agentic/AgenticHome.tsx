/**
 * The home screen with the assistant front and centre (behind the
 * `dashboard.agentic_home` flag): the conversation fills the screen, with a
 * strip of chips along the top for the widgets that matter right now.
 *
 *  - Each chip is a widget's one-line summary (`DashboardWidget.summary`) —
 *    no model call on page load, so the page is instant and free. Tapping a
 *    chip opens the widget itself under the strip; tapping again closes it.
 *  - The strip holds the widgets the person pinned (their dashboard settings)
 *    plus any whose summary says it's urgent, urgent first; a pinned widget
 *    with nothing to say drops out, so the strip never shows empty chips.
 *  - The conversation starts fresh on every visit and stays here as it grows;
 *    it is a stored conversation like any other, one tap from the Chat screen.
 *    The greeting is its empty state, so it gives way to the first message.
 *
 * The page fills the main area (`useFillPage`): no shell padding, no card
 * around the thread — on a phone the strip sits under the top bar, the thread
 * takes the rest, and the composer is docked at the bottom.
 */

import { Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { useAppVisible } from '@rambleraptor/homestead-core/apps/useAppVisibility';
import {
  getAllDashboardWidgets,
  getAppById,
  type RegisteredDashboardWidget,
} from '@rambleraptor/homestead-core/apps/registry';
import { AppIcon, getLazyComponent } from '@rambleraptor/homestead-core/apps/lazy';
import { resolveDashboardWidgets } from '@rambleraptor/homestead-core/settings/utils/resolveDashboardWidgets';
import { useConversation } from '@rambleraptor/homestead-core/chat/hooks/useConversation';
import { ChatThread } from '@rambleraptor/homestead-core/chat/components/ChatThread';
import { availableStarters } from '@rambleraptor/homestead-core/chat/starters';
import { useFillPage } from '@rambleraptor/homestead-core/layout/pageFill';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useGreeting } from '../../greeting';
import { useWidgetSummaries, type SummaryState } from './WidgetSummaries';

/** The dashboard's own way into chat; redundant when the chat *is* the home. */
const ASK_WIDGET_ID = 'chat-ask';

const EMPTY_DESCRIPTION = 'Ask about anything in your household, or have me change it.';

export function AgenticHome() {
  useFillPage();
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

  // Pinned, in the person's order — resolved by id so the registered widget
  // (with its app, for the chip's icon) is what's kept.
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const pinned = resolveDashboardWidgets(widgets, user?.dashboard_widget_order, user?.dashboard_hidden_widgets)
    .map((w) => byId.get(w.id))
    .filter((w): w is RegisteredDashboardWidget => w !== undefined);
  const urgent = widgets.filter((w) => summaries.get(w.id)?.urgent);
  const isUrgent = (id: string) => urgent.some((w) => w.id === id);
  const strip = [
    ...urgent,
    // A widget whose summary says "nothing" stays off the strip; one with no
    // summary hook (or one still loading) shows when pinned.
    ...pinned.filter((w) => !isUrgent(w.id) && summaries.get(w.id) !== null),
  ];

  // The widget opened from its chip. Looked up on each render, so a widget
  // that drops off the strip closes with it.
  const [openId, setOpenId] = useState<string | null>(null);
  const open = strip.find((w) => w.id === openId);
  const OpenWidget = open ? getLazyComponent(open.component) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="agentic-home">
      {probes}

      {(strip.length > 0 || conversationId) && (
        <div className="flex items-center gap-3 px-4 pt-3 lg:px-6">
          <div
            className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-testid="agentic-strip"
          >
            {strip.map((w) => (
              <WidgetChip
                key={w.id}
                widget={w}
                summary={summaries.get(w.id)}
                urgent={isUrgent(w.id)}
                open={w.id === openId}
                onToggle={() => setOpenId((cur) => (cur === w.id ? null : w.id))}
              />
            ))}
          </div>
          {conversationId && (
            <Link
              to={`/chat/${conversationId}`}
              className="shrink-0 text-sm text-text-muted hover:text-text-main"
              data-testid="agentic-open-chat"
            >
              Open in Chat <ArrowUpRight className="inline size-4" aria-hidden />
            </Link>
          )}
        </div>
      )}

      {OpenWidget && (
        <div
          className="max-h-[45dvh] overflow-y-auto px-4 pt-3 sm:max-w-md lg:px-6"
          data-testid="agentic-widget-panel"
        >
          <Suspense fallback={null}>
            <OpenWidget />
          </Suspense>
        </div>
      )}

      <ChatThread
        bare
        chat={chat}
        conversationId={conversationId}
        starters={availableStarters()}
        empty={{ title: greeting, description: EMPTY_DESCRIPTION }}
        placeholder="Ask Homestead…"
        className="flex"
      />
    </div>
  );
}

/** A widget's one line on the strip: its app's icon, its label, its headline. */
function WidgetChip({
  widget,
  summary,
  urgent,
  open,
  onToggle,
}: {
  widget: RegisteredDashboardWidget;
  summary: SummaryState;
  urgent: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const icon = getAppById(widget.appId)?.web?.icon;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        'flex shrink-0 snap-start items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
        open
          ? 'border-brand-navy bg-brand-navy text-white'
          : urgent
            ? 'border-accent-terracotta/30 bg-accent-terracotta/10 text-text-main hover:bg-accent-terracotta/15'
            : 'border-gray-100 bg-surface-white text-text-main hover:bg-bg-pearl/60',
      )}
      data-testid={`agentic-chip-${widget.id}`}
      data-urgent={urgent ? 'true' : undefined}
    >
      {icon && <AppIcon icon={icon} className="size-4 shrink-0" />}
      <span className="font-medium">{widget.label}</span>
      {summary?.headline && (
        <span className={cn('max-w-48 truncate', open ? 'text-white/80' : 'text-text-muted')}>
          {summary.headline}
        </span>
      )}
    </button>
  );
}
