import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { uploadSchema } from '@rambleraptor/homestead-core/resources/custom-methods/schema';

export const STORES = 'stores' as const;
export const GROCERIES = 'groceries' as const;

export const groceriesResources: ResourceDefinition[] = [
  {
    singular: 'store',
    plural: STORES,
    description: 'A grocery store (used to group grocery items).',
    user_settable_create: true,
    fields: {
      name: { type: 'string', required: true },
      sort_order: { type: 'number' },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
  {
    singular: 'grocery',
    plural: GROCERIES,
    description: "A single item on the household's shared grocery list.",
    user_settable_create: true,
    fields: {
      name: { type: 'string', required: true },
      // Quick-add omits `checked`; the engine fills this default so every
      // grocery persists as unchecked rather than with the field absent.
      checked: { type: 'boolean', default: false },
      // The section of the store the item is shelved in (a `sections.ts` id),
      // set by `groceries:categorize`. Empty until the list has been sorted.
      category: { type: 'string' },
      notes: { type: 'string' },
      // When a create omits `store`, the engine fills the household's
      // `default_store` app flag (see StoreManagement) — so the chat tools,
      // image import, and every other write path get the default store too,
      // not just the web form that reads the flag client-side.
      store: {
        type: 'string',
        reference: { resource: 'store', onDelete: 'restrict' },
        defaultFromFlag: { app: 'groceries', key: 'default_store' },
      },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
    // AEP-136 custom methods on the grocery collection:
    //   POST /api/aep/groceries:process-image
    //   POST /api/aep/groceries:send-notification
    //   POST /api/aep/groceries:categorize
    customMethods: {
      categorize: {
        target: 'collection',
        description:
          'Sort the whole grocery list by store section: decides which section each item belongs in and saves it as the item\'s category.',
        response: {
          type: 'object',
          properties: {
            sorted: { type: 'integer', description: 'Items a section was decided for.' },
            changed: { type: 'integer', description: 'Items whose section changed.' },
            message: { type: 'string' },
          },
          required: ['sorted', 'changed', 'message'],
        },
        load: () => import('./methods/categorize'),
      },
      'process-image': {
        target: 'collection',
        description: 'Read a photo of a grocery list and return the items on it (not saved).',
        request: {
          type: 'object',
          properties: { image: uploadSchema('The photo of the list (an image).') },
          required: ['image'],
        },
        response: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
            },
            message: { type: 'string' },
          },
          required: ['items', 'message'],
        },
        load: () => import('./methods/process-image'),
      },
      'send-notification': {
        target: 'collection',
        description: 'Tell the household the grocery list changed (a push notification).',
        load: () => import('./methods/send-notification'),
      },
    },
  },
];
