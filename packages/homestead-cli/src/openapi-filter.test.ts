import { describe, expect, it } from 'vitest';
import type { OpenAPI } from '@aep_dev/aep-lib-ts';
import { withoutCollectionMethods } from './openapi-filter.ts';

describe('withoutCollectionMethods', () => {
  it('drops collection-level custom methods and keeps everything else', () => {
    const doc = {
      openapi: '3.1.0',
      paths: {
        '/groceries': {},
        '/groceries/{grocery_id}': {},
        '/groceries:process-image': {},
        '/documents/{document_id}:classify': {},
        '/users/{user_id}/notifications': {},
        '/users/{user_id}/notifications:send': {},
        '/users/{user_id}/notification-subscriptions/{notification_subscription_id}:send-notification': {},
      },
    } as unknown as OpenAPI;

    expect(Object.keys(withoutCollectionMethods(doc).paths).sort()).toEqual([
      '/documents/{document_id}:classify',
      '/groceries',
      '/groceries/{grocery_id}',
      '/users/{user_id}/notification-subscriptions/{notification_subscription_id}:send-notification',
      '/users/{user_id}/notifications',
    ]);
  });
});
