/**
 * `/dashboard` (the home) and `/dashboard/c/:id` (a conversation on it).
 *
 * The home is the assistant's (`agentic/AgenticHome`), or the classic widget
 * stack (`ClassicHome`) for the `dashboard.classic_home` flag's audience. A
 * conversation's address opens the conversation either way: the classic
 * dashboard's Ask box starts one there, and past ones are in its drawer.
 */

import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { useHomeMode } from '../home';
import { AgenticHome } from './agentic/AgenticHome';
import { ClassicHome } from './ClassicHome';

export function DashboardHome({ params }: AppRouteProps) {
  const conversationId = params?.id ?? null;
  const mode = useHomeMode();
  if (conversationId) return <AgenticHome conversationId={conversationId} />;
  // Not known yet: show neither home rather than flash the wrong one.
  if (mode === undefined) return null;
  return mode === 'classic' ? <ClassicHome /> : <AgenticHome conversationId={null} />;
}
