import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const PEOPLE = 'people' as const;
export const PERSON_SHARED_DATA = 'person-shared-data' as const;
export const ADDRESSES = 'addresses' as const;
export const PERSON_RELATIONSHIPS = 'person-relationships' as const;
export const HOUSEHOLDS = 'households' as const;

export const RELATIONSHIP_KINDS = ['partner', 'parent', 'sibling'] as const;

export const peopleResources: ResourceDefinition[] = [
  {
    singular: 'person',
    plural: PEOPLE,
    description:
      'A person tracked by the household (family, friend, contact).',
    user_settable_create: true,
    fields: {
      name: { type: 'string', required: true },
      // Alternate names this person is known by (maiden name, nickname,
      // middle name). Used to match a printed name back to one person when
      // capturing receipts and importing records.
      aliases: { type: 'array', items: { type: 'string' } },
      // This person's own Homestead account, so the assistant knows who is who
      // ("your partner Sam"). A label only — it grants nothing. One person per
      // account: linking an account moves it off any other person.
      user: {
        type: 'string',
        reference: { resource: 'user' },
        description: "This person's Homestead account, when they have one.",
      },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
    bulkImport: {
      formats: [
        {
          id: 'csv',
          label: 'CSV',
          inputType: 'file',
          accept: '.csv',
          hasTemplate: true,
          load: () => import('./methods/bulk-import-csv'),
        },
      ],
      // A person's address and partner live in sibling resources, and partners
      // can reference someone created later in the same file — so people needs
      // the whole selection at once, not a row-at-a-time create.
      save: () => import('./methods/bulk-import-csv'),
    },
    bulkExport: {
      formats: [
        {
          id: 'csv',
          label: 'CSV',
          mimeType: 'text/csv',
          extension: 'csv',
          load: () => import('./methods/bulk-export-csv'),
        },
      ],
      // The inverse of the importer's saver: name + address + partner live
      // across three collections, so exporting a flat row means joining them.
      source: () => import('./methods/bulk-export-csv'),
      options: [
        {
          id: 'combine_households',
          type: 'boolean',
          default: false,
          label: 'Combine household members into one row',
        },
      ],
    },
  },
  {
    singular: 'person-shared-data',
    plural: PERSON_SHARED_DATA,
    // Legacy: replaced by `household`. Kept (unread) until a later release
    // drops it, so the backfill migration has its data to copy.
    description:
      'Legacy, replaced by households — do not create. Grouped up to two ' +
      'people who shared an address.',
    user_settable_create: true,
    fields: {
      person_a: {
        type: 'string',
        reference: { resource: 'person' },
        required: true,
      },
      person_b: { type: 'string', reference: { resource: 'person' } },
      address_id: { type: 'string', reference: { resource: 'address' } },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
  {
    singular: 'person-relationship',
    plural: PERSON_RELATIONSHIPS,
    description:
      'A family link between two people. For kind=parent, person_a is the ' +
      'parent of person_b; partner and sibling are symmetric.',
    user_settable_create: true,
    fields: {
      // A relationship row is only a link, so it goes with either person.
      person_a: {
        type: 'string',
        required: true,
        reference: { resource: 'person', onDelete: 'cascade' },
      },
      person_b: {
        type: 'string',
        required: true,
        reference: { resource: 'person', onDelete: 'cascade' },
      },
      kind: { type: 'string', required: true, enum: [...RELATIONSHIP_KINDS] },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
  {
    singular: 'household',
    plural: HOUSEHOLDS,
    description:
      'A home shared by a group of people: its address and WiFi. A person ' +
      'can belong to several households (a main home and a lake house).',
    user_settable_create: true,
    fields: {
      name: { type: 'string', required: true },
      members: {
        type: 'array',
        items: { type: 'string', reference: { resource: 'person', onDelete: 'set-null' } },
      },
      line1: { type: 'string' },
      line2: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      postal_code: { type: 'string' },
      country: { type: 'string' },
      wifi_network: { type: 'string' },
      wifi_password: { type: 'string' },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
  {
    singular: 'address',
    plural: ADDRESSES,
    // Legacy: replaced by the address fields on `household`. Kept (unread)
    // until a later release drops it, so the backfill migration has its data.
    description:
      'Legacy, replaced by households — do not create. A physical address ' +
      'with optional WiFi credentials.',
    user_settable_create: true,
    fields: {
      line1: { type: 'string', required: true },
      line2: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      postal_code: { type: 'string' },
      country: { type: 'string' },
      wifi_network: { type: 'string' },
      wifi_password: { type: 'string' },
      shared_data_id: {
        type: 'string',
        reference: { resource: 'person-shared-data' },
      },
      created_by: { type: 'string', required: true, reference: { resource: 'user' } },
    },
  },
];
