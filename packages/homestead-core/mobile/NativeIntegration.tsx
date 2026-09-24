import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { aepbase } from '../api/aepbase';
import { queryClient } from '../api/queryClient';
import { isNativeHomestead, nativeRequest } from './bridge';

/** Platform lifecycle only. This component renders no native or web UI. */
export function NativeIntegration() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (isNativeHomestead()) void nativeRequest('routeChanged', { path: pathname }).catch(() => {});
  }, [pathname]);
  useEffect(() => {
    if (!isNativeHomestead()) return;
    let lastUserID: string | null | undefined;
    const notify = () => {
      const userID = aepbase.authStore.isValid ? aepbase.getCurrentUser()?.id ?? null : null;
      if (lastUserID === userID) return;
      lastUserID = userID;
      void nativeRequest('authChanged', { userID }).catch(() => { /* Unsupported/closed container. */ });
    };
    notify();
    const unsubscribeAuth = aepbase.authStore.onChange(notify);
    const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') {
        void nativeRequest('mutationCommitted').catch(() => {});
      }
    });
    const foreground = () => { void queryClient.invalidateQueries(); };
    window.addEventListener('homestead:foreground', foreground);
    const downloadFailed = () => { toast.error('Download failed. Please try again.'); };
    window.addEventListener('homestead:downloadFailed', downloadFailed);
    return () => {
      unsubscribeAuth(); unsubscribeMutations();
      window.removeEventListener('homestead:foreground', foreground);
      window.removeEventListener('homestead:downloadFailed', downloadFailed);
    };
  }, []);
  return null;
}
