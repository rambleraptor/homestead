/**
 * Apply the aepbase schema for e2e tests.
 *
 * POSTs resource definitions directly via the meta-API. Keeps the e2e
 * bootstrap independent of Terraform — no extra tool required in CI. The
 * resource definitions here must stay in sync with aepbase/terraform/*.tf;
 * any schema change needs to be mirrored here.
 */

import { getAepbaseUrl } from './aepbase.setup';

interface ResourceDefinition {
  singular: string;
  plural: string;
  description?: string;
  user_settable_create?: boolean;
  parents?: string[];
  schema: {
    type: 'object';
    properties: Record<string, Record<string, unknown>>;
    required?: string[];
  };
}

const DEFINITIONS: ResourceDefinition[] = [
  {
    singular: 'gift-card',
    plural: 'gift-cards',
    description: 'A stored-value gift card owned by the household.',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        merchant: { type: 'string' },
        card_number: { type: 'string' },
        pin: { type: 'string' },
        amount: { type: 'number' },
        notes: { type: 'string' },
        archived: { type: 'boolean' },
        front_image: {
          type: 'binary',
          'x-aepbase-file-field': true,
          description: 'Front-of-card image (jpeg/png/webp/gif, <=5MB)',
        },
        back_image: {
          type: 'binary',
          'x-aepbase-file-field': true,
          description: 'Back-of-card image (jpeg/png/webp/gif, <=5MB)',
        },
        created_by: { type: 'string' },
      },
      required: ['merchant', 'card_number', 'amount'],
    },
  },
  {
    singular: 'transaction',
    plural: 'transactions',
    description: 'A balance change recorded against a gift card.',
    user_settable_create: true,
    parents: ['gift-card'],
    schema: {
      type: 'object',
      properties: {
        transaction_type: { type: 'string' },
        previous_amount: { type: 'number' },
        new_amount: { type: 'number' },
        amount_changed: { type: 'number' },
        notes: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['transaction_type', 'previous_amount', 'new_amount', 'amount_changed'],
    },
  },
  {
    singular: 'credit-card',
    plural: 'credit-cards',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        issuer: { type: 'string' },
        last_four: { type: 'string' },
        annual_fee: { type: 'number' },
        anniversary_date: { type: 'string' },
        reset_mode: { type: 'string' },
        notes: { type: 'string' },
        archived: { type: 'boolean' },
        created_by: { type: 'string' },
      },
      required: ['name', 'issuer', 'annual_fee', 'anniversary_date', 'reset_mode'],
    },
  },
  {
    singular: 'perk',
    plural: 'perks',
    user_settable_create: true,
    parents: ['credit-card'],
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        value: { type: 'number' },
        frequency: { type: 'string' },
        category: { type: 'string' },
        notes: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['name', 'value', 'frequency'],
    },
  },
  {
    singular: 'redemption',
    plural: 'redemptions',
    user_settable_create: true,
    parents: ['perk'],
    schema: {
      type: 'object',
      properties: {
        period_start: { type: 'string' },
        period_end: { type: 'string' },
        redeemed_at: { type: 'string' },
        amount: { type: 'number' },
        notes: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['period_start', 'period_end', 'redeemed_at', 'amount'],
    },
  },
  {
    singular: 'person',
    plural: 'people',
    description: 'A person tracked by the household (family, friend, contact).',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        birthday: { type: 'string', format: 'date-time' },
        notification_preferences: {
          type: 'object',
          description: 'legacy; kept for backward compatibility',
        },
        created_by: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    singular: 'person-shared-data',
    plural: 'person-shared-data',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        person_a: { type: 'string' },
        person_b: { type: 'string' },
        address_id: { type: 'string' },
        anniversary: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['person_a'],
    },
  },
  {
    singular: 'address',
    plural: 'addresses',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        line1: { type: 'string' },
        line2: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        postal_code: { type: 'string' },
        country: { type: 'string' },
        wifi_network: { type: 'string' },
        wifi_password: { type: 'string' },
        shared_data_id: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['line1'],
    },
  },
  {
    singular: 'notification',
    plural: 'notifications',
    user_settable_create: true,
    parents: ['user'],
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        message: { type: 'string' },
        notification_type: { type: 'string' },
        scheduled_for: { type: 'string', format: 'date-time' },
        sent_at: { type: 'string', format: 'date-time' },
        read: { type: 'boolean' },
        read_at: { type: 'string', format: 'date-time' },
        source_collection: { type: 'string' },
        source_id: { type: 'string' },
        person_id: { type: 'string' },
        recurring_notification_id: { type: 'string' },
      },
      required: ['title', 'message', 'notification_type'],
    },
  },
  {
    singular: 'notification-subscription',
    plural: 'notification-subscriptions',
    user_settable_create: true,
    parents: ['user'],
    schema: {
      type: 'object',
      properties: {
        subscription_data: { type: 'object' },
        enabled: { type: 'boolean' },
      },
      required: ['subscription_data'],
    },
  },
  {
    singular: 'recurring-notification',
    plural: 'recurring-notifications',
    user_settable_create: true,
    parents: ['user'],
    schema: {
      type: 'object',
      properties: {
        source_collection: { type: 'string' },
        source_id: { type: 'string' },
        title_template: { type: 'string' },
        message_template: { type: 'string' },
        reference_date_field: { type: 'string' },
        timing: { type: 'string' },
        enabled: { type: 'boolean' },
        last_triggered: { type: 'string', format: 'date-time' },
      },
      required: ['source_collection', 'source_id', 'title_template', 'message_template', 'reference_date_field', 'timing'],
    },
  },
  {
    singular: 'user-preference',
    plural: 'user-preferences',
    user_settable_create: true,
    parents: ['user'],
    schema: {
      type: 'object',
      properties: {
        map_provider: { type: 'string' },
      },
    },
  },
  {
    singular: 'grocery',
    plural: 'groceries',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        checked: { type: 'boolean' },
        notes: { type: 'string' },
        store: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    singular: 'store',
    plural: 'stores',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        sort_order: { type: 'number' },
        created_by: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    singular: 'hsa-receipt',
    plural: 'hsa-receipts',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        merchant: { type: 'string' },
        service_date: { type: 'string', format: 'date-time' },
        amount: { type: 'number' },
        category: { type: 'string' },
        patient: { type: 'string' },
        status: { type: 'string' },
        receipt_file: {
          type: 'binary',
          'x-aepbase-file-field': true,
          description: 'Receipt file (jpeg/png/webp/gif/pdf, <=10MB)',
        },
        notes: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['merchant', 'service_date', 'amount', 'category', 'status', 'receipt_file'],
    },
  },
  {
    singular: 'action',
    plural: 'actions',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        script_id: { type: 'string' },
        parameters: { type: 'object' },
        last_run_at: { type: 'string', format: 'date-time' },
        created_by: { type: 'string' },
      },
      required: ['name', 'script_id'],
    },
  },
  {
    singular: 'run',
    plural: 'runs',
    user_settable_create: true,
    parents: ['action'],
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        started_at: { type: 'string', format: 'date-time' },
        completed_at: { type: 'string', format: 'date-time' },
        duration_ms: { type: 'number' },
        error: { type: 'string' },
        result: { type: 'object' },
        input_request: { type: 'object' },
        input_response: { type: 'object' },
      },
      required: ['status'],
    },
  },
  {
    singular: 'game',
    plural: 'games',
    description: 'A mini golf game session.',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        played_at: { type: 'string' },
        players: { type: 'array', items: { type: 'string' } },
        hole_count: { type: 'number' },
        completed: { type: 'boolean' },
        notes: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['players', 'hole_count'],
    },
  },
  {
    singular: 'hole',
    plural: 'holes',
    description: 'A single hole within a mini golf game.',
    user_settable_create: true,
    parents: ['game'],
    schema: {
      type: 'object',
      properties: {
        hole_number: { type: 'number' },
        par: { type: 'number' },
        scores: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              player: { type: 'string' },
              strokes: { type: 'number' },
            },
          },
        },
        created_by: { type: 'string' },
      },
      required: ['hole_number', 'par', 'scores'],
    },
  },
  {
    singular: 'pictionary-game',
    plural: 'pictionary-games',
    description: 'A single Pictionary game session.',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        played_at: { type: 'string' },
        location: { type: 'string' },
        winning_word: { type: 'string' },
        notes: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['played_at'],
    },
  },
  {
    singular: 'pictionary-team',
    plural: 'pictionary-teams',
    description: 'A team within a Pictionary game.',
    user_settable_create: true,
    parents: ['pictionary-game'],
    schema: {
      type: 'object',
      properties: {
        players: { type: 'array', items: { type: 'string' } },
        won: { type: 'boolean' },
        rank: { type: 'number' },
        created_by: { type: 'string' },
      },
      required: ['players'],
    },
  },
  {
    singular: 'recipe',
    plural: 'recipes',
    description: 'A culinary recipe with parsed ingredients for scaling.',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Display name of the recipe.',
        },
        source_pointer: {
          type: 'string',
          description:
            "URI or physical reference (e.g. 'https://...' or 'Book: Food Lab pg 124').",
        },
        parsed_ingredients: {
          type: 'array',
          description:
            'Structured ingredient list separated from quantities for scaling.',
          items: {
            type: 'object',
            properties: {
              item: { type: 'string' },
              qty: { type: 'number' },
              unit: { type: 'string' },
              raw: { type: 'string' },
            },
          },
        },
        method: {
          type: 'string',
          description: 'Step-by-step instructions formatted as Markdown.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Categorical tags for filtering and menu generation.',
        },
        created_by: { type: 'string', description: 'users/{user_id}' },
      },
      required: ['title', 'parsed_ingredients'],
    },
  },
  {
    singular: 'module-flag',
    plural: 'module-flags',
    description:
      'Household-wide singleton that stores current values for every declared module flag. Kept in sync at runtime by the Next.js instrumentation hook; declared here so e2e runs (which skip the runtime sync) can still write to it.',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        recipes__enabled: {
          type: 'string',
          description:
            "Who can use the Recipes module. 'superusers' restricts it to superusers; 'all' makes it available to every signed-in user; 'none' hides it from everyone (including superusers). (default: superusers) (one of: superusers, all, none)",
        },
        settings__omnibox_access: {
          type: 'string',
          description:
            'Who can use the natural-language omnibox (⌘K / search bar). (default: superuser) (one of: superuser, all)',
        },
      },
    },
  },
];

export async function applySchema(adminToken: string): Promise<void> {
  const base = getAepbaseUrl();
  const existing = await fetch(`${base}/aep-resource-definitions?max_page_size=200`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  }).then((r) => r.json() as Promise<{ results?: Array<{ id: string }> }>);
  const existingIds = new Set((existing.results || []).map((r) => r.id));

  // aepbase requires parents to exist before children. DEFINITIONS are
  // already in dependency order (parents first).
  for (const def of DEFINITIONS) {
    if (existingIds.has(def.singular)) {
      continue;
    }
    const res = await fetch(`${base}/aep-resource-definitions?id=${def.singular}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(def),
    });
    if (!res.ok) {
      throw new Error(
        `apply-schema: failed to create ${def.singular}: ${res.status} ${await res.text()}`,
      );
    }
  }
}
