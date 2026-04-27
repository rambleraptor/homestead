import { aepbase, AepCollections } from '@/core/api/aepbase';
import { useAepUpdate } from '@/core/api/resourceHooks';
import type { Notification } from '../types';

function userParent() {
  const userId = aepbase.getCurrentUser()?.id;
  if (!userId) throw new Error('User not authenticated');
  return [AepCollections.USERS, userId];
}

export function useMarkNotificationAsRead() {
  const mutation = useAepUpdate<Notification, { id: string }>(
    AepCollections.NOTIFICATIONS,
    {
      moduleId: 'notifications',
      parent: userParent,
      transform: () => ({ read: true, read_at: new Date().toISOString() }),
    },
  );
  return {
    ...mutation,
    mutate: (id: string) => mutation.mutate({ id }),
    mutateAsync: (id: string) => mutation.mutateAsync({ id }),
  };
}
