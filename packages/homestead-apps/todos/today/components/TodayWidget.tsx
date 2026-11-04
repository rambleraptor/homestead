/**
 * The Today card: one glance at what the household needs from you today.
 *
 * Rendered as a `SectionCard` rather than the usual `WidgetCard` because it
 * has no owning app to link its title to — every line links somewhere
 * different, which is the point of the card.
 */

import { Link } from 'react-router-dom';
import {
  AlarmClock,
  CalendarHeart,
  CreditCard,
  ListTodo,
  ShoppingCart,
  Sun,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { SectionCard } from '@rambleraptor/homestead-core/shared/components/SectionCard';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { useToday } from '../hooks/useToday';
import type { TodayItem, TodayLane, TodayUrgency } from '../types';

const LANE_ICONS: Record<TodayLane, LucideIcon> = {
  reminder: AlarmClock,
  event: CalendarHeart,
  pickup: Trash2,
  perk: CreditCard,
  groceries: ShoppingCart,
  todos: ListTodo,
};

/**
 * Urgency reads as colour weight, not as a badge: the card is scanned, and six
 * competing badges would be noisier than the six lines they label.
 */
const URGENCY_TONE: Record<TodayUrgency, { chip: string; icon: string }> = {
  now: { chip: 'bg-accent-terracotta/10', icon: 'text-accent-terracotta' },
  soon: { chip: 'bg-amber-50', icon: 'text-amber-600' },
  ambient: { chip: 'bg-gray-50', icon: 'text-text-muted' },
};

function TodayRow({ item }: { item: TodayItem }) {
  const Icon = LANE_ICONS[item.lane];
  const tone = URGENCY_TONE[item.urgency];

  return (
    <li>
      <Link
        to={item.href}
        className="flex items-start gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-bg-pearl/60 transition-colors"
        data-testid={`today-item-${item.lane}`}
      >
        <div className={cn('rounded-lg p-2 shrink-0', tone.chip)} aria-hidden="true">
          <Icon className={cn('w-4 h-4', tone.icon)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-body font-medium text-text-main text-base truncate">
            {item.title}
          </p>
          {item.detail && (
            <p className="font-body text-sm text-text-muted truncate">
              {item.detail}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

export function TodayWidget() {
  const { items, isLoading } = useToday();

  return (
    <div data-testid="today-widget">
      <SectionCard icon={Sun} title="Today" bodyClassName="px-4 py-0">
        {isLoading ? (
          <div className="py-4">
            <SkeletonList
              rows={3}
              label="Loading today"
              data-testid="today-widget-loading"
            />
          </div>
        ) : items.length > 0 ? (
          <ul className="divide-y divide-gray-50" data-testid="today-list">
            {items.map((item) => (
              <TodayRow key={item.id} item={item} />
            ))}
          </ul>
        ) : (
          <EmptyState
            compact
            icon={Sun}
            title="Nothing on for today"
            description="Todos, pickups and plans due today show up here."
            className="my-4"
            data-testid="today-empty"
          />
        )}
      </SectionCard>
    </div>
  );
}
