/**
 * AppShell Component
 *
 * Main application layout wrapper.
 * Combines sidebar, header, and content area.
 */

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthGuard } from '../auth/AuthGuard';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* Sidebar */}
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <Header onMenuClick={toggleSidebar} />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto p-4 lg:p-6 max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
