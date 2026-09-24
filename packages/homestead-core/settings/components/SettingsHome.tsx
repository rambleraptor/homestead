import { NativeDeviceSettings } from '../../mobile/NativeDeviceSettings';
import { useState } from 'react';
import { DashboardWidgetSettings } from './DashboardWidgetSettings';
import { NotificationDevices } from './NotificationDevices';
import { ChangePasswordForm } from './ChangePasswordForm';
import { SignOutEverywhere } from './SignOutEverywhere';
import { PersonalAccessTokens } from './PersonalAccessTokens';
import { ConnectedApps } from './ConnectedApps';
import { AppUserSettingsCard } from '@rambleraptor/homestead-core/user-settings/components/AppUserSettingsCard';
import { getAllSettingsWidgets } from '@rambleraptor/homestead-core/apps/registry';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';

type SettingsTab = 'general' | 'connections';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'connections', label: 'Connections' },
];

export function SettingsHome() {
  const appSettings = getAllSettingsWidgets();
  const [tab, setTab] = useState<SettingsTab>('general');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your preferences and notifications"
      />

      <div className="border-b border-gray-200" role="tablist" data-testid="settings-tabs">
        <nav className="-mb-px flex gap-6">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              data-testid={`settings-tab-${id}`}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                tab === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'general' && (
        <div className="space-y-6" data-testid="settings-general">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Notifications
            </h2>
            <NotificationDevices />
          </div>

          <NativeDeviceSettings />
          <DashboardWidgetSettings />

          {appSettings.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                App Settings
              </h2>
              <div
                className="space-y-4"
                data-testid="app-user-settings-list"
              >
                {appSettings.map(({ appId, app }) => (
                  <AppUserSettingsCard key={appId} app={app} />
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Security
            </h2>
            <div className="space-y-4">
              <ChangePasswordForm />
              <SignOutEverywhere />
            </div>
          </div>
        </div>
      )}

      {tab === 'connections' && (
        <div className="space-y-4" data-testid="settings-connections">
          <PersonalAccessTokens />
          <ConnectedApps />
        </div>
      )}
    </div>
  );
}
