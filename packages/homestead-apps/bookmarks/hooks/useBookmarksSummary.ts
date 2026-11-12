/**
 * The bookmarks widget in one line, for the agentic home's strip. Always
 * there — it's a place to save a link — and never urgent.
 */

import type { WidgetSummary } from '@rambleraptor/homestead-core/apps/types';
import { useBookmarks } from './useBookmarks';

export default function useBookmarksSummary(): WidgetSummary | null | undefined {
  const { data, isLoading } = useBookmarks();
  if (isLoading) return undefined;
  const unread = (data ?? []).filter((bookmark) => !bookmark.read).length;
  if (unread === 0) return { headline: 'Save a link' };
  return { headline: `${unread} to read` };
}
