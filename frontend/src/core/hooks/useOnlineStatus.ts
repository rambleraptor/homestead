import { useState, useEffect } from 'react';

// Type declaration for test-specific window property
declare global {
  interface Window {
    __testOffline__?: boolean;
  }
}

/**
 * Hook to track online/offline status
 * @returns boolean indicating if the browser is currently online
 */
export function useOnlineStatus(): boolean {
  // Helper to get online status, checking test override first
  const getOnlineStatus = () => {
    // In E2E tests, allow overriding via window.__testOffline__ flag
    if (typeof window !== 'undefined' && '__testOffline__' in window) {
      return !window.__testOffline__;
    }
    return navigator.onLine;
  };

  const [isOnline, setIsOnline] = useState(getOnlineStatus);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Handler for test-specific offline state changes
    const handleTestOfflineChange = () => {
      setIsOnline(getOnlineStatus());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('test-offline-change', handleTestOfflineChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('test-offline-change', handleTestOfflineChange);
    };
  }, []);

  return isOnline;
}
