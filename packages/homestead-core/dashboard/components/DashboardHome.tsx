/**
 * `/dashboard` (a new conversation) and `/dashboard/c/:id` (an existing one):
 * the home. See `agentic/AgenticHome`.
 */

import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { AgenticHome } from './agentic/AgenticHome';

export function DashboardHome({ params }: AppRouteProps) {
  return <AgenticHome conversationId={params?.id ?? null} />;
}
