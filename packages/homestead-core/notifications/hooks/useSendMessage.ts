/**
 * Send a household member a message (`users/{id}/notifications:send`): a push
 * to their devices and a row in their inbox, from the signed-in user.
 */

import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { USERS } from '@rambleraptor/homestead-core/resources/builtins';
import { NOTIFICATIONS } from '../constants';

export interface SendMessageInput {
  to: string;
  title: string;
  body?: string;
  /** An in-app path opened when it's tapped. */
  url?: string;
}

export interface SendMessageResult {
  notification: string;
  delivered: number;
  failed: number;
}

export function useSendMessage() {
  return useMutation({
    mutationFn: ({ to, ...message }: SendMessageInput) =>
      aepbase.customMethod<SendMessageResult>(NOTIFICATIONS, 'send', message, { parent: [USERS, to] }),
  });
}
