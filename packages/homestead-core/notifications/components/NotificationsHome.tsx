import { Link, useSearchParams } from 'react-router-dom';
import { Bell, Check, Calendar } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { useNotifications } from '../hooks/useNotifications';
import { useScheduledNotifications } from '../hooks/useScheduledNotifications';
import { ScheduledSection } from './ScheduledSection';
import { useMarkNotificationAsRead } from '../hooks/useMarkNotificationAsRead';
import type { Notification } from '../types';

/**
 * Where tapping a notification lands.
 *
 * `url` is what the push payload already carried — the dispatcher now copies it
 * onto the inbox row too, so the row in the list goes to the same place the
 * pop-up would have. Only in-app paths are linked: anything not starting with a
 * single `/` is ignored rather than rendered as an anchor, so a malformed or
 * off-site value can't turn an inbox row into an outbound link. (`//host` is a
 * protocol-relative URL, hence the second check.)
 */
function internalPath(url: string | undefined): string | null {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return null;
  return url;
}

function NotificationsPanel() {
  const { data: notifications, isLoading } = useNotifications();
  const markAsRead = useMarkNotificationAsRead();

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead.mutateAsync(id);
    } catch (error) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  };

  const getNotificationIcon = (notification: Notification) => {
    // Keyed off *why* the notification fired, not which app sent it. The old
    // rule matched `source_collection === 'people'`, which named a feature app
    // from core and had stopped matching anything besides: the events cron
    // stamps `events`, and `person_id` is deprecated. Every scheduled reminder
    // — from any app — now reads as a calendar; anything else is a bell.
    const scheduled =
      notification.notification_type === 'day_of' ||
      notification.notification_type === 'day_before' ||
      notification.notification_type === 'week_before' ||
      notification.notification_type === 'reminder';
    return scheduled ? (
      <Calendar className="w-5 h-5 text-blue-500" />
    ) : (
      <Bell className="w-5 h-5 text-gray-500" />
    );
  };

  const unreadNotifications = notifications?.filter((n) => !n.read) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {unreadNotifications.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Unread Notifications
          </h2>
          <div className="space-y-3">
            {unreadNotifications.map((notification) => (
              <Card key={notification.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getNotificationIcon(notification)}
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {internalPath(notification.url) ? (
                          <Link
                            to={internalPath(notification.url) as string}
                            className="hover:text-brand-navy hover:underline"
                            data-testid={`notification-link-${notification.id}`}
                          >
                            {notification.title}
                          </Link>
                        ) : (
                          notification.title
                        )}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {formatDate(notification.created)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleMarkAsRead(notification.id)}
                    disabled={markAsRead.isPending}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Mark as Read
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!notifications || unreadNotifications.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">No notifications yet</p>
            <p className="text-sm text-gray-500 mt-2">
              You'll receive notifications for upcoming events here
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * Two halves of one idea, as two tabs: the **inbox** (what has been delivered)
 * and the **queue** (what is scheduled to be). They're the same objects a
 * minute apart — the dispatcher cron moves a row from the second list to the
 * first — so putting them on one page is what makes "why did I get that?" and
 * "what's coming?" answerable in the same place.
 *
 * The selected tab lives in the URL (`?tab=scheduled`) rather than in state
 * alone, so a link can point straight at the queue.
 */
type NotificationsTab = 'inbox' | 'scheduled';

const TABS: { id: NotificationsTab; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'scheduled', label: 'Scheduled' },
];

const TAB_PARAM = 'tab';

export function NotificationsHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: scheduled } = useScheduledNotifications();

  // Anything unrecognized reads as the default tab, so a stale or hand-edited
  // link lands somewhere sensible instead of on a blank page.
  const tab: NotificationsTab =
    searchParams.get(TAB_PARAM) === 'scheduled' ? 'scheduled' : 'inbox';

  const selectTab = (next: NotificationsTab) => {
    // Mutate a copy so any other params on the URL survive the switch.
    const params = new URLSearchParams(searchParams);
    if (next === 'inbox') params.delete(TAB_PARAM);
    else params.set(TAB_PARAM, next);
    setSearchParams(params, { replace: true });
  };

  const queuedCount = (scheduled ?? []).filter((r) => r.status === 'scheduled').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Center"
        subtitle="What you've been told, and what you're about to be"
      />

      <div
        className="border-b border-gray-200"
        role="tablist"
        data-testid="notifications-tabs"
      >
        <nav className="-mb-px flex gap-6">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => selectTab(id)}
              data-testid={`notifications-tab-${id}`}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                tab === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {label}
              {id === 'scheduled' && queuedCount > 0 && (
                <span className="ml-2 text-xs text-gray-400">{queuedCount}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'inbox' ? <NotificationsPanel /> : <ScheduledSection />}
    </div>
  );
}
