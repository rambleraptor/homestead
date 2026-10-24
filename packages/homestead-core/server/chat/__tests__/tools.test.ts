/**
 * Tests for the chat app's resource-definition → tool mapping. Tool input
 * schemas are Zod schemas (provider-agnostic, via the Vercel AI SDK), so we
 * assert their behavior by parsing sample inputs rather than inspecting a
 * provider-specific schema object.
 */

import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import { buildTools, listParamShape } from '../tools';
import type { ResourceDefinition } from '../../../resources/types';

const giftCard: ResourceDefinition = {
  singular: 'gift-card',
  plural: 'gift-cards',
  description: 'A stored-value gift card.',
  fields: {
    merchant: { type: 'string', required: true },
    amount: { type: 'number', required: true },
    archived: { type: 'boolean' },
    front_image: {
      type: 'file',
      description: 'Front-of-card image',
      required: true,
    },
  },
};

const transaction: ResourceDefinition = {
  singular: 'transaction',
  plural: 'transactions',
  parents: ['gift-card'],
  fields: {
    transaction_type: {
      type: 'string',
      enum: ['decrement', 'set'],
      required: true,
    },
    new_amount: { type: 'number', required: true },
  },
};

const notification: ResourceDefinition = {
  singular: 'notification',
  plural: 'notifications',
  parents: ['user'],
  fields: {
    title: { type: 'string', required: true },
    subscription_data: { type: 'object' },
    scheduled_for: { type: 'string', format: 'date-time' },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

// Two-level nesting: redemption → perk → credit-card.
const creditCard: ResourceDefinition = {
  singular: 'credit-card',
  plural: 'credit-cards',
  fields: { name: { type: 'string' } },
};
const perk: ResourceDefinition = {
  singular: 'perk',
  plural: 'perks',
  parents: ['credit-card'],
  fields: { name: { type: 'string' } },
};
const redemption: ResourceDefinition = {
  singular: 'redemption',
  plural: 'redemptions',
  parents: ['perk'],
  fields: { notes: { type: 'string' } },
};

const ALL = [giftCard, transaction, notification, creditCard, perk, redemption];

/** The Zod object schema for a tool, typed for `.shape`/`.safeParse` access. */
function schemaFor(
  tools: ReturnType<typeof buildTools>['tools'],
  name: string,
): z.ZodObject<z.ZodRawShape> {
  return tools[name].inputSchema as z.ZodObject<z.ZodRawShape>;
}

function keysFor(
  tools: ReturnType<typeof buildTools>['tools'],
  name: string,
): string[] {
  return Object.keys(schemaFor(tools, name).shape);
}

/** A field's description, unwrapping `.optional()` to find it if needed. */
function descOf(field: z.ZodTypeAny): string | undefined {
  let f: unknown = field;
  while (f) {
    const node = f as { description?: string; unwrap?: () => z.ZodTypeAny };
    if (node.description) return node.description;
    f = typeof node.unwrap === 'function' ? node.unwrap() : undefined;
  }
  return undefined;
}

/** The description on an array field's element schema (unwrapping `.optional()`). */
function itemDescOf(field: z.ZodTypeAny): string | undefined {
  let f = field as { unwrap?: () => z.ZodTypeAny };
  if (typeof f.unwrap === 'function') f = f.unwrap() as typeof f;
  const arr = f as unknown as { element?: z.ZodTypeAny };
  return arr.element ? descOf(arr.element) : undefined;
}

describe('buildTools', () => {
  it('generates four tools per resource with snake_case names', () => {
    const { tools, bindings } = buildTools(ALL);
    expect(Object.keys(tools)).toHaveLength(ALL.length * 4);
    for (const name of [
      'create_gift_card',
      'read_gift_card',
      'update_gift_card',
      'delete_gift_card',
    ]) {
      expect(bindings.has(name)).toBe(true);
      expect(tools[name]).toBeDefined();
    }
  });

  it('produces only valid tool names', () => {
    const { tools } = buildTools(ALL);
    for (const name of Object.keys(tools)) {
      expect(name).toMatch(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
    }
  });

  it('strips file fields, including from required', () => {
    const { tools } = buildTools([giftCard]);
    const create = schemaFor(tools, 'create_gift_card');
    expect(keysFor(tools, 'create_gift_card')).not.toContain('front_image');
    // merchant + amount are required; the (file) front_image is not.
    expect(create.safeParse({}).success).toBe(false);
    expect(create.safeParse({ merchant: 'M', amount: 5 }).success).toBe(true);
  });

  it('leaves out files below the top level, and any list that holds one', () => {
    const scrapbook: ResourceDefinition = {
      singular: 'scrapbook',
      plural: 'scrapbooks',
      fields: {
        title: { type: 'string', required: true },
        attachments: { type: 'array', items: { type: 'file' } },
        profile: {
          type: 'object',
          properties: { bio: { type: 'string' }, avatar: { type: 'file' } },
        },
        // Replaced whole on update: a model that can't keep the scans would drop them.
        pages: {
          type: 'array',
          items: { type: 'object', properties: { caption: { type: 'string' }, scan: { type: 'file' } } },
        },
        tags: { type: 'array', items: { type: 'string' } },
      },
    };
    const { tools } = buildTools([scrapbook]);
    expect(keysFor(tools, 'create_scrapbook').sort()).toEqual(['profile', 'tags', 'title']);
    const create = schemaFor(tools, 'create_scrapbook');
    // The object stays, without its file.
    expect(create.safeParse({ title: 't', profile: { bio: 'hi' } }).success).toBe(true);
  });

  it('omits deprecated fields from the create and update tools', () => {
    const withDeprecated: ResourceDefinition = {
      singular: 'widget',
      plural: 'widgets',
      fields: {
        name: { type: 'string', required: true },
        old_code: { type: 'string', deprecated: true },
      },
    };
    const { tools } = buildTools([withDeprecated]);
    expect(keysFor(tools, 'create_widget')).not.toContain('old_code');
    expect(keysFor(tools, 'update_widget')).not.toContain('old_code');
    expect(keysFor(tools, 'create_widget')).toContain('name');
  });

  it('adds a required parent id param for parented resources', () => {
    const { tools, bindings } = buildTools(ALL);
    const create = schemaFor(tools, 'create_transaction');
    expect(keysFor(tools, 'create_transaction')).toContain('gift_card_id');
    expect(
      create.safeParse({ transaction_type: 'set', new_amount: 1 }).success,
    ).toBe(false);
    expect(
      create.safeParse({ gift_card_id: 'g', transaction_type: 'set', new_amount: 1 })
        .success,
    ).toBe(true);
    expect(bindings.get('create_transaction')).toMatchObject({
      parentChain: ['gift-card'],
      parentPlurals: ['gift-cards'],
    });
  });

  it('treats user as a built-in parent root', () => {
    const { tools, bindings } = buildTools([notification]);
    const read = schemaFor(tools, 'read_notification');
    expect(keysFor(tools, 'read_notification')).toContain('user_id');
    expect(read.safeParse({}).success).toBe(false);
    expect(read.safeParse({ user_id: 'u' }).success).toBe(true);
    expect(bindings.get('read_notification')).toMatchObject({
      parentChain: ['user'],
      parentPlurals: ['users'],
    });
  });

  it('resolves multi-level parent chains root first', () => {
    const { tools, bindings } = buildTools(ALL);
    expect(keysFor(tools, 'create_redemption')).toEqual(
      expect.arrayContaining(['credit_card_id', 'perk_id', 'notes']),
    );
    expect(bindings.get('create_redemption')).toMatchObject({
      parentChain: ['credit-card', 'perk'],
      parentPlurals: ['credit-cards', 'perks'],
    });
  });

  it('declares free-form objects as JSON strings and records them', () => {
    const { tools, bindings } = buildTools([notification]);
    const create = schemaFor(tools, 'create_notification');
    // Accepts a JSON string, rejects a raw object. (user_id is the required
    // parent param for the user-scoped notification resource.)
    expect(
      create.safeParse({ user_id: 'u', title: 'T', subscription_data: '{"a":1}' })
        .success,
    ).toBe(true);
    expect(
      create.safeParse({ user_id: 'u', title: 'T', subscription_data: { a: 1 } })
        .success,
    ).toBe(false);
    expect(descOf(create.shape.subscription_data)).toContain('JSON object');
    expect(bindings.get('create_notification')!.jsonStringFields).toEqual(
      new Set(['subscription_data']),
    );
  });

  it('accepts date-time strings and typed arrays', () => {
    const { tools } = buildTools([notification]);
    const create = schemaFor(tools, 'create_notification');
    expect(
      create.safeParse({
        user_id: 'u',
        title: 'T',
        scheduled_for: '2026-01-01T00:00:00Z',
      }).success,
    ).toBe(true);
    expect(
      create.safeParse({ user_id: 'u', title: 'T', tags: ['a', 'b'] }).success,
    ).toBe(true);
    expect(
      create.safeParse({ user_id: 'u', title: 'T', tags: [1, 2] }).success,
    ).toBe(false);
  });

  it('read takes an optional id; update and delete require it', () => {
    const { tools } = buildTools([giftCard]);
    const read = schemaFor(tools, 'read_gift_card');
    expect(keysFor(tools, 'read_gift_card')).toContain('id');
    expect(read.safeParse({}).success).toBe(true);

    const update = schemaFor(tools, 'update_gift_card');
    expect(update.safeParse({}).success).toBe(false);
    // Update fields are all optional (merge patch).
    expect(update.safeParse({ id: 'x' }).success).toBe(true);
    expect(keysFor(tools, 'update_gift_card')).toContain('merchant');

    const del = schemaFor(tools, 'delete_gift_card');
    expect(del.safeParse({}).success).toBe(false);
    expect(del.safeParse({ id: 'x' }).success).toBe(true);
    expect(keysFor(tools, 'delete_gift_card')).not.toContain('merchant');
  });

  it('points the model at the read tool for a declared reference target', () => {
    const person: ResourceDefinition = {
      singular: 'person',
      plural: 'people',
      fields: { name: { type: 'string', required: true } },
    };
    const shared: ResourceDefinition = {
      singular: 'person-shared-data',
      plural: 'person-shared-data',
      fields: {
        person_a: {
          type: 'string',
          required: true,
          reference: { resource: 'person' },
        },
        created_by: { type: 'string', reference: { resource: 'user' } },
        players: {
          type: 'array',
          items: { type: 'string', reference: { resource: 'person' } },
        },
      },
    };
    const { tools } = buildTools([person, shared]);
    const create = schemaFor(tools, 'create_person_shared_data');

    // Declared target → hint names its read tool.
    expect(descOf(create.shape.person_a)).toBe(
      'id of a person record (use read_person to find one)',
    );
    // Built-in `user` has no generated tool → no read hint.
    expect(descOf(create.shape.created_by)).toBe('id of a user record');
    // References inside array items are annotated on the element.
    expect(itemDescOf(create.shape.players)).toBe(
      'id of a person record (use read_person to find one)',
    );
  });

  it('records validatable references on create/update bindings only', () => {
    const person: ResourceDefinition = {
      singular: 'person',
      plural: 'people',
      fields: { name: { type: 'string' } },
    };
    const childThing: ResourceDefinition = {
      singular: 'child-thing',
      plural: 'child-things',
      parents: ['person'],
      fields: { name: { type: 'string' } },
    };
    const game: ResourceDefinition = {
      singular: 'game',
      plural: 'games',
      fields: {
        owner: { type: 'string', reference: { resource: 'person' } },
        created_by: { type: 'string', reference: { resource: 'user' } },
        // Parent-scoped target — not fetchable by id alone, so excluded.
        thing: { type: 'string', reference: { resource: 'child-thing' } },
        players: {
          type: 'array',
          items: { type: 'string', reference: { resource: 'person' } },
        },
      },
    };
    const { bindings } = buildTools([person, childThing, game]);

    const create = bindings.get('create_game')!;
    expect(create.references).toEqual(
      expect.arrayContaining([
        { field: 'owner', plural: 'people', isArray: false },
        { field: 'created_by', plural: 'users', isArray: false },
        { field: 'players', plural: 'people', isArray: true },
      ]),
    );
    expect(create.references.map((r) => r.field)).not.toContain('thing');
    expect(bindings.get('update_game')!.references).toHaveLength(3);
    // Reads and deletes don't write, so they carry no reference checks.
    expect(bindings.get('read_game')!.references).toEqual([]);
    expect(bindings.get('delete_game')!.references).toEqual([]);
  });

  it('declares enum fields as real enums', () => {
    const { tools } = buildTools(ALL);
    const create = schemaFor(tools, 'create_transaction');
    expect(
      create.safeParse({
        gift_card_id: 'g',
        transaction_type: 'decrement',
        new_amount: 1,
      }).success,
    ).toBe(true);
    expect(
      create.safeParse({
        gift_card_id: 'g',
        transaction_type: 'other',
        new_amount: 1,
      }).success,
    ).toBe(false);
  });
});

describe('list params on the read tool', () => {
  const { tools } = buildTools([giftCard, transaction]);
  const readSchema = tools.read_gift_card.inputSchema as z.ZodObject;

  it('accepts filter, order_by and limit alongside the optional id', () => {
    const parsed = readSchema.parse({
      filter: 'merchant == "Target" && amount > 10',
      order_by: '-amount',
      limit: 5,
    });
    expect(parsed).toEqual({
      filter: 'merchant == "Target" && amount > 10',
      order_by: '-amount',
      limit: 5,
    });
    expect(readSchema.parse({})).toEqual({});
  });

  it('bounds limit to 1–100 integers', () => {
    expect(readSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(readSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(readSchema.safeParse({ limit: 2.5 }).success).toBe(false);
    expect(readSchema.safeParse({ limit: 100 }).success).toBe(true);
  });

  it('keeps the list params off the write tools', () => {
    for (const name of ['create_gift_card', 'update_gift_card', 'delete_gift_card']) {
      const shape = (tools[name].inputSchema as z.ZodObject).shape;
      expect(Object.keys(shape)).not.toContain('filter');
      expect(Object.keys(shape)).not.toContain('limit');
    }
  });

  it('teaches the grammar once, in the typed param description', () => {
    // The params are `.optional()`, so the description sits on the inner schema.
    const describe = (schema: z.ZodTypeAny) =>
      (schema as z.ZodOptional<z.ZodTypeAny>).unwrap().description ?? '';
    expect(describe(readSchema.shape.filter)).toContain('has(<field>)');
    expect(describe(readSchema.shape.order_by)).toContain('-field');
    expect(describe(listParamShape({ brief: true }).filter)).not.toContain('has(<field>)');
    expect(describe(listParamShape({ brief: true }).filter)).toContain('instructions');
  });
});
