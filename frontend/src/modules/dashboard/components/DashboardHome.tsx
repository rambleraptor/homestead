/**
 * Dashboard Home Component
 *
 * Home screen showing important information: unread notifications and upcoming events
 */

import { useAuth } from '@/core/auth/useAuth';
import { useNavigate } from 'react-router-dom';
import { Bell, Calendar, ArrowRight, Loader2 } from 'lucide-react';
import { useUnreadNotifications } from '../hooks/useUnreadNotifications';
import { useUpcomingEvents } from '../hooks/useUpcomingEvents';
import { formatDistanceToNow, format } from 'date-fns';

export function DashboardHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: notifications, isLoading: notificationsLoading } = useUnreadNotifications();
  const { data: upcomingEvents, isLoading: eventsLoading } = useUpcomingEvents();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.name || 'User'}
        </h1>
        <p className="mt-2 text-gray-600">
          Here's what's happening
        </p>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unread Notifications Section */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Bell className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Notifications
                </h2>
                {notifications && notifications.length > 0 && (
                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                    {notifications.length}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="p-6">
            {notificationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : notifications && notifications.length > 0 ? (
              <div className="space-y-4">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                    onClick={() => {
                      if (notification.event_id) {
                        navigate('/events');
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {notification.title}
                        </h3>
                        <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                          {formatDistanceToNow(new Date(notification.created), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No unread notifications</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Events Section */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="w-5 h-5 text-purple-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">
                  Upcoming Events
                </h2>
              </div>
              <button
                onClick={() => navigate('/events')}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                View all
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-6">
            {eventsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : upcomingEvents && upcomingEvents.length > 0 ? (
              <div className="space-y-4">
                {upcomingEvents.map((event) => {
                  const eventDate = new Date(event.event_date);
                  const daysUntil = Math.ceil(
                    (eventDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                  );

                  return (
                    <div
                      key={event.id}
                      className="p-4 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors cursor-pointer"
                      onClick={() => navigate('/events')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {event.title}
                          </h3>
                          <p className="mt-1 text-sm text-gray-600">
                            {event.people_involved}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">
                              {format(eventDate, 'MMM dd, yyyy')}
                            </span>
                            <span className="text-xs text-gray-500">
                              {daysUntil === 0
                                ? 'Today'
                                : daysUntil === 1
                                ? 'Tomorrow'
                                : `in ${daysUntil} days`}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            event.event_type === 'birthday'
                              ? 'bg-pink-100 text-pink-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {event.event_type}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No upcoming events in the next 30 days</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
