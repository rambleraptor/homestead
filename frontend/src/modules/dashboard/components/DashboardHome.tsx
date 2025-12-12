/**
 * Dashboard Home Component
 *
 * Main dashboard view showing overview of HomeOS system
 */


import { useAuth } from '../../../core/auth/useAuth';
import { LayoutDashboard, Users, Activity, Clock } from 'lucide-react';

export function DashboardHome() {
  const { user } = useAuth();

  const stats = [
    {
      title: 'Welcome Back',
      value: user?.name || 'User',
      icon: Users,
      color: 'blue',
    },
    {
      title: 'Active Modules',
      value: '0',
      subtitle: 'Available to you',
      icon: LayoutDashboard,
      color: 'green',
    },
    {
      title: 'Recent Activity',
      value: '0',
      subtitle: 'Actions today',
      icon: Activity,
      color: 'purple',
    },
    {
      title: 'Last Login',
      value: 'Just now',
      subtitle: 'Current session',
      icon: Clock,
      color: 'orange',
    },
  ];

  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Welcome to your Home Operating System
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {stat.title}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                    {stat.value}
                  </p>
                </div>
                <div
                  className={`${
                    colorClasses[stat.color as keyof typeof colorClasses]
                  } p-3 rounded-lg`}
                >
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Start Guide */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          🚀 Getting Started with HomeOS
        </h2>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
              1
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Explore Modules
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Check out the available modules in the sidebar. Each module provides
                different functionality for managing your home.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
              2
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Create New Modules
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Follow the pattern in <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">src/modules/dashboard</code> to
                create your own modules (Chores, Meal Planner, etc.).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
              3
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Register Your Module
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Add your module to <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">src/modules/registry.ts</code> and
                it will automatically appear in navigation!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Architecture Highlights */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg shadow-md p-6 text-white">
        <h2 className="text-xl font-bold mb-4">
          ✨ Modular Architecture
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold mb-2">Self-Contained Modules</h3>
            <p className="text-sm text-primary-100">
              Each module has its own components, hooks, routes, and types. No
              cross-dependencies.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Easy to Extend</h3>
            <p className="text-sm text-primary-100">
              Creating a new module is as simple as following the established pattern.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
