/**
 * Tests for the FieldDef → JSON-schema wire translation and the
 * boot-time definition validation.
 */

import { describe, expect, it } from 'vitest';
import {
  toWireSchema,
  validateReferenceTargets,
  validateResourceDefinition,
  validateSyncResources,
  variantSchemaName,
} from '../translate';
import type { FieldDef, ResourceDefinition } from '../types';

describe('toWireSchema', () => {
  it('wraps fields in a JSON-schema object and collects required', () => {
    expect(
      toWireSchema({
        merchant: { type: 'string', required: true },
        amount: { type: 'number', required: true },
        notes: { type: 'string' },
      }, 'gift-card'),
    ).toEqual({
      type: 'object',
      properties: {
        merchant: { type: 'string' },
        amount: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['merchant', 'amount'],
    });
  });

  it('omits the required array when no field is required', () => {
    expect(toWireSchema({ notes: { type: 'string' } }, 'gift-card')).toEqual({
      type: 'object',
      properties: { notes: { type: 'string' } },
    });
  });

  it('translates file fields to binary + x-aepbase-file-field', () => {
    expect(
      toWireSchema({
        receipt: { type: 'file', description: 'Receipt image' },
      }, 'gift-card').properties.receipt,
    ).toEqual({
      type: 'binary',
      description: 'Receipt image',
      'x-aepbase-file-field': true,
    });
  });

  it('encodes enums into the description', () => {
    const { properties } = toWireSchema({
      status: { type: 'string', enum: ['pending', 'done'] },
      mode: {
        type: 'string',
        description: 'defaults to fast',
        enum: ['fast', 'slow'],
      },
    }, 'gift-card');
    expect(properties.status).toEqual({
      type: 'string',
      description: 'one of: pending, done',
    });
    expect(properties.mode).toEqual({
      type: 'string',
      description: 'defaults to fast (one of: fast, slow)',
    });
  });

  it('folds a deprecation note into the description, keeping the column', () => {
    const { properties } = toWireSchema({
      old_code: { type: 'string', deprecated: true },
      legacy_note: {
        type: 'string',
        description: 'freeform note',
        deprecated: true,
      },
    }, 'gift-card');
    // The property still exists (deprecated fields keep their column + data).
    expect(properties.old_code).toEqual({
      type: 'string',
      description: 'deprecated — do not use; scheduled for removal',
    });
    expect(properties.legacy_note).toEqual({
      type: 'string',
      description: 'freeform note (deprecated — do not use; scheduled for removal)',
    });
  });

  it('rejects a field that is both deprecated and required', () => {
    expect(() =>
      validateResourceDefinition({
        singular: 'widget',
        plural: 'widgets',
        fields: { gone: { type: 'string', deprecated: true, required: true } },
      }),
    ).toThrow(/both deprecated and required/);
  });

  it('strips display names from the wire schema', () => {
    expect(
      toWireSchema({
        player: {
          type: 'string',
          singular_name: 'player',
          plural_name: 'players',
        },
      }, 'game').properties.player,
    ).toEqual({ type: 'string' });
  });

  it('recurses into array items and object properties', () => {
    expect(
      toWireSchema({
        scores: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              player: { type: 'string', required: true },
              strokes: { type: 'integer' },
            },
          },
        },
      }, 'game').properties.scores,
    ).toEqual({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          player: { type: 'string' },
          strokes: { type: 'integer' },
        },
        required: ['player'],
      },
    });
  });

  it('passes format through', () => {
    expect(
      toWireSchema({
        due_at: { type: 'string', format: 'date-time' },
      }, 'todo').properties.due_at,
    ).toEqual({ type: 'string', format: 'date-time' });
  });

  it('emits the default keyword on the wire property', () => {
    const { properties } = toWireSchema({
      checked: { type: 'boolean', default: false },
      count: { type: 'integer', default: 0 },
    }, 'grocery');
    expect(properties.checked).toEqual({ type: 'boolean', default: false });
    expect(properties.count).toEqual({ type: 'integer', default: 0 });
  });

  it('emits an x-aepbase-default-from marker (+ note) for defaultFromFlag', () => {
    const { properties } = toWireSchema({
      store: {
        type: 'string',
        reference: { resource: 'store', onDelete: 'restrict' },
        defaultFromFlag: { app: 'groceries', key: 'default_store' },
      },
    }, 'grocery');
    expect(properties.store).toEqual({
      type: 'string',
      description:
        'reference to a store record (by id); ' +
        'defaults to the household "default_store" setting when omitted',
      'x-aepbase-reference': { resource: 'store', onDelete: 'restrict' },
      'x-aepbase-default-from': {
        resource: 'app-flags',
        field: 'groceries__default_store',
      },
    });
  });
});

describe('toWireSchema — tagged unions', () => {
  const docFields = {
    metadata: {
      type: 'object' as const,
      discriminator: 'doc_type',
      variants: {
        'form-1099-int': {
          payer_name: { type: 'string' as const, required: true },
          box_1_interest: { type: 'number' as const },
        },
        'form-w2': { employer: { type: 'string' as const } },
      },
    },
  };

  it('translates variants to oneOf with an injected required tag', () => {
    const { properties } = toWireSchema(docFields, 'document');
    expect(properties.metadata.oneOf).toEqual([
      {
        type: 'object',
        properties: {
          doc_type: { type: 'string', enum: ['form-1099-int'] },
          payer_name: { type: 'string' },
          box_1_interest: { type: 'number' },
        },
        required: ['doc_type', 'payer_name'],
      },
      {
        type: 'object',
        properties: {
          doc_type: { type: 'string', enum: ['form-w2'] },
          employer: { type: 'string' },
        },
        required: ['doc_type'],
      },
    ]);
  });

  it('maps each tag value to a namespaced component schema', () => {
    const { properties } = toWireSchema(docFields, 'document');
    expect(properties.metadata.discriminator).toEqual({
      propertyName: 'doc_type',
      mapping: {
        'form-1099-int': '#/components/schemas/DocumentMetadataForm1099Int',
        'form-w2': '#/components/schemas/DocumentMetadataFormW2',
      },
    });
  });

  it('namespaces by resource + field so a variant cannot collide with a resource', () => {
    expect(variantSchemaName('document', 'metadata', 'form-1099-int')).toBe(
      'DocumentMetadataForm1099Int',
    );
    // A resource whose singular is `form-1099-int` occupies the bare
    // `Form1099Int`-shaped key; the namespaced variant must not collide.
    expect(variantSchemaName('document', 'metadata', 'form-1099-int')).not.toBe(
      'Form1099Int',
    );
  });
});

describe('validateResourceDefinition — tagged unions', () => {
  const def = (fields: ResourceDefinition['fields']): ResourceDefinition => ({
    singular: 'document',
    plural: 'documents',
    fields,
  });

  const union = (
    variants: Record<string, Record<string, FieldDef>>,
    discriminator: string | undefined = 'doc_type',
  ) => def({ metadata: { type: 'object', discriminator, variants } });

  it('accepts a well-formed union', () => {
    expect(() =>
      validateResourceDefinition(
        union({
          'form-1099-int': { payer_name: { type: 'string' } },
          'form-w2': { employer: { type: 'string' } },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a field whose type disagrees across variants', () => {
    expect(() =>
      validateResourceDefinition(
        union({
          'form-1099-int': { amount: { type: 'number' } },
          'form-w2': { amount: { type: 'string' } },
        }),
      ),
    ).toThrow(/declares "amount" as number in variant .* but string in .* types must agree/s);
  });

  it('accepts a field shared across variants when the types agree', () => {
    expect(() =>
      validateResourceDefinition(
        union({
          'form-1099-int': { amount: { type: 'number' } },
          'form-w2': { amount: { type: 'number' } },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects variants without a discriminator, and vice versa', () => {
    // Built inline: passing `undefined` to `union` would hit its default.
    expect(() =>
      validateResourceDefinition(
        def({
          metadata: {
            type: 'object',
            variants: { 'form-w2': { employer: { type: 'string' } } },
          },
        }),
      ),
    ).toThrow(/declares variants but no discriminator/);
    expect(() =>
      validateResourceDefinition(
        def({ metadata: { type: 'object', discriminator: 'doc_type' } }),
      ),
    ).toThrow(/declares a discriminator but no variants/);
  });

  it('rejects a variant that declares the discriminator itself', () => {
    expect(() =>
      validateResourceDefinition(
        union({ 'form-w2': { doc_type: { type: 'string' } } }),
      ),
    ).toThrow(/must not declare the discriminator "doc_type"/);
  });

  it('rejects non-kebab-case variant ids and non-snake_case tags', () => {
    expect(() =>
      validateResourceDefinition(union({ formW2: { employer: { type: 'string' } } })),
    ).toThrow(/variant "formW2" must be kebab-case/);
    expect(() =>
      validateResourceDefinition(
        union({ 'form-w2': { employer: { type: 'string' } } }, 'docType'),
      ),
    ).toThrow(/discriminator "docType" must be snake_case/);
  });

  it('rejects variants on a non-object field, and properties alongside variants', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          metadata: {
            type: 'string',
            discriminator: 'doc_type',
            variants: { 'form-w2': {} },
          },
        }),
      ),
    ).toThrow(/declares variants but is not an object/);
    expect(() =>
      validateResourceDefinition(
        def({
          metadata: {
            type: 'object',
            discriminator: 'doc_type',
            variants: { 'form-w2': {} },
            properties: { other: { type: 'string' } },
          },
        }),
      ),
    ).toThrow(/cannot declare both properties and variants/);
  });

  it('validates field names inside variants', () => {
    expect(() =>
      validateResourceDefinition(
        union({ 'form-w2': { employerName: { type: 'string' } } }),
      ),
    ).toThrow(/"metadata.form-w2.employerName" must be snake_case/);
  });
});

describe('validateResourceDefinition', () => {
  const def = (
    overrides: Partial<ResourceDefinition>,
  ): ResourceDefinition => ({
    singular: 'gift-card',
    plural: 'gift-cards',
    fields: {},
    ...overrides,
  });

  it('accepts a well-formed definition', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          fields: {
            card_number: { type: 'string', required: true },
            status: { type: 'string', enum: ['active', 'used'] },
            front_image: { type: 'file' },
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects non-kebab-case singular/plural', () => {
    expect(() =>
      validateResourceDefinition(def({ singular: 'giftCard' })),
    ).toThrow(/must be kebab-case/);
    expect(() =>
      validateResourceDefinition(def({ plural: 'gift_cards' })),
    ).toThrow(/must be kebab-case/);
  });

  it('rejects non-snake_case field names, including nested ones', () => {
    expect(() =>
      validateResourceDefinition(
        def({ fields: { cardNumber: { type: 'string' } } }),
      ),
    ).toThrow(/"cardNumber" must be snake_case/);
    expect(() =>
      validateResourceDefinition(
        def({
          fields: {
            address: {
              type: 'object',
              properties: { zipCode: { type: 'string' } },
            },
          },
        }),
      ),
    ).toThrow(/"address.zipCode" must be snake_case/);
  });

  it('rejects enum on non-string fields', () => {
    expect(() =>
      validateResourceDefinition(
        def({ fields: { count: { type: 'number', enum: ['1'] } } }),
      ),
    ).toThrow(/declares enum but is not a string/);
  });

  it('accepts a default that matches the field type', () => {
    expect(() =>
      validateResourceDefinition(
        def({ fields: { checked: { type: 'boolean', default: false } } }),
      ),
    ).not.toThrow();
  });

  it('rejects a default whose type mismatches the field', () => {
    expect(() =>
      validateResourceDefinition(
        def({ fields: { count: { type: 'integer', default: 'three' } } }),
      ),
    ).toThrow(/default must be an integer/);
  });

  it('rejects a default on a file field', () => {
    expect(() =>
      validateResourceDefinition(
        def({ fields: { photo: { type: 'file', default: 'x' } } }),
      ),
    ).toThrow(/file field .* cannot declare a default/);
  });

  it('rejects a default outside the declared enum values', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          fields: { status: { type: 'string', enum: ['a', 'b'], default: 'c' } },
        }),
      ),
    ).toThrow(/default must be one of its enum values/);
  });

  it('accepts defaultFromFlag on a string reference field', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          fields: {
            store: {
              type: 'string',
              reference: { resource: 'store' },
              defaultFromFlag: { app: 'groceries', key: 'default_store' },
            },
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects defaultFromFlag on a non-string field', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          fields: {
            count: { type: 'integer', defaultFromFlag: { app: 'a', key: 'k' } },
          },
        }),
      ),
    ).toThrow(/declares defaultFromFlag but is not a string/);
  });

  it('rejects defaultFromFlag alongside a static default or enum', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          fields: {
            store: {
              type: 'string',
              default: 'x',
              defaultFromFlag: { app: 'a', key: 'k' },
            },
          },
        }),
      ),
    ).toThrow(/both default and defaultFromFlag/);
    expect(() =>
      validateResourceDefinition(
        def({
          fields: {
            store: {
              type: 'string',
              enum: ['x'],
              defaultFromFlag: { app: 'a', key: 'k' },
            },
          },
        }),
      ),
    ).toThrow(/both enum and defaultFromFlag/);
  });

  it('rejects defaultFromFlag missing an app or key', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          fields: { store: { type: 'string', defaultFromFlag: { app: '', key: 'k' } } },
        }),
      ),
    ).toThrow(/must name both an app and a key/);
  });

  it('rejects arrays without items and items on non-arrays', () => {
    expect(() =>
      validateResourceDefinition(
        def({ fields: { tags: { type: 'array' } } }),
      ),
    ).toThrow(/must declare items/);
    expect(() =>
      validateResourceDefinition(
        def({
          fields: { name: { type: 'string', items: { type: 'string' } } },
        }),
      ),
    ).toThrow(/declares items but is not an array/);
  });
});

describe('toWireSchema — references', () => {
  it('folds a reference into the wire description and emits a structured marker', () => {
    const { properties } = toWireSchema(
      { person_a: { type: 'string', reference: { resource: 'person' } } },
      'person-shared-data',
    );
    expect(properties.person_a).toEqual({
      type: 'string',
      description: 'reference to a person record (by id)',
      'x-aepbase-reference': { resource: 'person' },
    });
  });

  it('includes onDelete in the marker when declared', () => {
    const { properties } = toWireSchema(
      { store: { type: 'string', reference: { resource: 'store', onDelete: 'restrict' } } },
      'grocery',
    );
    expect(properties.store['x-aepbase-reference']).toEqual({
      resource: 'store',
      onDelete: 'restrict',
    });
  });

  it('appends the reference note to an existing description', () => {
    const { properties } = toWireSchema(
      {
        project: {
          type: 'string',
          description: 'empty/missing means the main project.',
          reference: { resource: 'project' },
        },
      },
      'todo',
    );
    expect(properties.project.description).toBe(
      'empty/missing means the main project. (reference to a project record (by id))',
    );
  });

  it('notes references on array items', () => {
    const { properties } = toWireSchema(
      {
        players: {
          type: 'array',
          items: { type: 'string', reference: { resource: 'person' } },
        },
      },
      'game',
    );
    expect(properties.players).toEqual({
      type: 'array',
      items: {
        type: 'string',
        description: 'reference to a person record (by id)',
        'x-aepbase-reference': { resource: 'person' },
      },
    });
  });

  it('strips the structured reference from the wire schema', () => {
    const { properties } = toWireSchema(
      { created_by: { type: 'string', reference: { resource: 'user' } } },
      'todo',
    );
    expect(properties.created_by).not.toHaveProperty('reference');
  });
});

describe('validateResourceDefinition — references', () => {
  const def = (fields: ResourceDefinition['fields']): ResourceDefinition => ({
    singular: 'person-shared-data',
    plural: 'person-shared-data',
    fields,
  });

  it('accepts a well-formed string reference and an array-item reference', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          person_a: { type: 'string', reference: { resource: 'person' } },
          players: {
            type: 'array',
            items: { type: 'string', reference: { resource: 'person' } },
          },
          address_id: {
            type: 'string',
            reference: { resource: 'address', onDelete: 'set-null' },
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a reference on a non-string field', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          players: {
            type: 'array',
            items: { type: 'string' },
            reference: { resource: 'person' },
          },
        }),
      ),
    ).toThrow(/declares a reference but is not a string/);
  });

  it('rejects a field with both enum and reference', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          person_a: {
            type: 'string',
            enum: ['a'],
            reference: { resource: 'person' },
          },
        }),
      ),
    ).toThrow(/both enum and reference/);
  });

  it('rejects a non-kebab-case reference resource', () => {
    expect(() =>
      validateResourceDefinition(
        def({ person_a: { type: 'string', reference: { resource: 'Person' } } }),
      ),
    ).toThrow(/reference resource "Person" must be kebab-case/);
  });

  it('rejects an invalid onDelete', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          person_a: {
            type: 'string',
            // @ts-expect-error deliberately invalid onDelete value
            reference: { resource: 'person', onDelete: 'explode' },
          },
        }),
      ),
    ).toThrow(/onDelete "explode" must be one of/);
  });

  it('rejects onDelete: set-null on a required field', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          person_a: {
            type: 'string',
            required: true,
            reference: { resource: 'person', onDelete: 'set-null' },
          },
        }),
      ),
    ).toThrow(/required field cannot be nulled/);
  });

  it('accepts onDelete: set-null on a non-required field', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          person_a: {
            type: 'string',
            reference: { resource: 'person', onDelete: 'set-null' },
          },
        }),
      ),
    ).not.toThrow();
  });
});

describe('validateReferenceTargets', () => {
  const person: ResourceDefinition = {
    singular: 'person',
    plural: 'people',
    fields: { name: { type: 'string' } },
  };

  it('accepts references to declared resources and the built-in user root', () => {
    const shared: ResourceDefinition = {
      singular: 'person-shared-data',
      plural: 'person-shared-data',
      fields: {
        person_a: { type: 'string', reference: { resource: 'person' } },
        created_by: { type: 'string', reference: { resource: 'user' } },
      },
    };
    expect(() => validateReferenceTargets([person, shared])).not.toThrow();
  });

  it('throws on a reference to an unknown resource, naming the array-item field', () => {
    const bad: ResourceDefinition = {
      singular: 'event',
      plural: 'events',
      fields: {
        people: {
          type: 'array',
          items: { type: 'string', reference: { resource: 'persn' } },
        },
      },
    };
    expect(() => validateReferenceTargets([bad])).toThrow(
      /field "people\[\]" references unknown resource "persn"/,
    );
  });

  it('walks references nested in array items and object properties', () => {
    const nested: ResourceDefinition = {
      singular: 'game',
      plural: 'games',
      fields: {
        scores: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              player: { type: 'string', reference: { resource: 'ghost' } },
            },
          },
        },
      },
    };
    expect(() => validateReferenceTargets([nested])).toThrow(
      /field "scores\[\]\.player" references unknown resource "ghost"/,
    );
  });
});

describe('validateSyncResources', () => {
  const known = ['user', 'address', 'user-preference'];

  it('accepts syncs whose resource is in the known set', () => {
    expect(() =>
      validateSyncResources(known, [
        { id: 'a', resource: 'user' },
        { id: 'b', resource: 'address' },
      ]),
    ).not.toThrow();
  });

  it('accepts an empty sync list', () => {
    expect(() => validateSyncResources(known, [])).not.toThrow();
  });

  it('throws on an unknown resource, naming the sync and resource', () => {
    expect(() =>
      validateSyncResources(known, [{ id: 'mirror', resource: 'addres' }]),
    ).toThrow(/sync "mirror" targets unknown resource "addres"/);
  });

  it('includes the app id in the message when present', () => {
    expect(() =>
      validateSyncResources(known, [
        { id: 'mirror', resource: 'ghost', appId: 'config' },
      ]),
    ).toThrow(/sync "mirror" \(app "config"\) targets unknown resource "ghost"/);
  });

  it('accepts a Set as the known collection', () => {
    expect(() =>
      validateSyncResources(new Set(known), [{ id: 'a', resource: 'user' }]),
    ).not.toThrow();
  });
});

describe('toWireSchema — ai file fields', () => {
  it('synthesizes a companion <field>_text string field when extracting text', () => {
    const { properties, required } = toWireSchema(
      { file: { type: 'file', required: true, ai: { extract_text: true } } },
      'document',
    );
    expect(properties.file).toEqual({
      type: 'binary',
      'x-aepbase-file-field': true,
    });
    expect(properties.file_text).toEqual({
      type: 'string',
      description: 'Full text extracted from file by the AI pipeline.',
      'x-aepbase-file-text-field': true,
    });
    // Companion is stored but not required.
    expect(required).toEqual(['file']);
  });

  it('synthesizes the companion for embed too (embed implies extract_text)', () => {
    const { properties } = toWireSchema(
      { file: { type: 'file', ai: { embed: true } } },
      'document',
    );
    expect(properties.file_text).toEqual({
      type: 'string',
      description: 'Full text extracted from file by the AI pipeline.',
      'x-aepbase-file-text-field': true,
    });
  });

  it('marks the companion so the engine encrypts it at rest', () => {
    const { properties } = toWireSchema(
      { file: { type: 'file', ai: { extract_text: true } } },
      'document',
    );
    expect(properties.file_text?.['x-aepbase-file-text-field']).toBe(true);
  });

  it('uses singular_name in the companion description when present', () => {
    const { properties } = toWireSchema(
      {
        scan: { type: 'file', singular_name: 'receipt scan', ai: { extract_text: true } },
      },
      'expense',
    );
    expect(properties.scan_text?.description).toBe(
      'Full text extracted from receipt scan by the AI pipeline.',
    );
  });

  it('strips ai and adds no companion for a plain file field', () => {
    const { properties } = toWireSchema(
      { file: { type: 'file' } },
      'document',
    );
    expect(properties.file).toEqual({
      type: 'binary',
      'x-aepbase-file-field': true,
    });
    expect(properties.file_text).toBeUndefined();
  });
});

describe('validateResourceDefinition — ai file fields', () => {
  const def = (fields: ResourceDefinition['fields']): ResourceDefinition => ({
    singular: 'document',
    plural: 'documents',
    fields,
  });

  it('accepts a well-formed ai file field', () => {
    expect(() =>
      validateResourceDefinition(
        def({ file: { type: 'file', ai: { embed: { chunk_size: 800, overlap: 100 } } } }),
      ),
    ).not.toThrow();
  });

  it('rejects ai options on a non-file field', () => {
    expect(() =>
      validateResourceDefinition(
        def({ notes: { type: 'string', ai: { extract_text: true } } }),
      ),
    ).toThrow(/declares ai options but is not a file field/);
  });

  it('rejects embed with extract_text:false', () => {
    expect(() =>
      validateResourceDefinition(
        def({ file: { type: 'file', ai: { embed: true, extract_text: false } } }),
      ),
    ).toThrow(/embedding requires extracted text/);
  });

  it('rejects a hand-declared field colliding with the synthesized companion', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          file: { type: 'file', ai: { extract_text: true } },
          file_text: { type: 'string' },
        }),
      ),
    ).toThrow(/auto-generates a companion "file_text" field, but "file_text" is already declared/);
  });

  it('rejects overlap >= chunk_size', () => {
    expect(() =>
      validateResourceDefinition(
        def({ file: { type: 'file', ai: { embed: { chunk_size: 500, overlap: 500 } } } }),
      ),
    ).toThrow(/overlap must be smaller than chunk_size/);
  });
});

describe('constraint keywords', () => {
  const def = (fields: Record<string, FieldDef>): ResourceDefinition => ({
    singular: 'widget',
    plural: 'widgets',
    fields,
  });

  it('emits numeric/string/array keywords into the wire schema', () => {
    const { properties } = toWireSchema(
      {
        amount: { type: 'number', minimum: 0, maximum: 100 },
        qty: { type: 'integer', exclusiveMinimum: 0, multipleOf: 5 },
        code: { type: 'string', minLength: 2, maxLength: 4, pattern: '^[A-Z]+$' },
        tags: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          uniqueItems: true,
          items: { type: 'string' },
        },
      },
      'widget',
    );
    expect(properties.amount).toEqual({ type: 'number', minimum: 0, maximum: 100 });
    expect(properties.qty).toEqual({ type: 'integer', exclusiveMinimum: 0, multipleOf: 5 });
    expect(properties.code).toEqual({
      type: 'string',
      minLength: 2,
      maxLength: 4,
      pattern: '^[A-Z]+$',
    });
    expect(properties.tags).toMatchObject({
      type: 'array',
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
    });
  });

  it('rejects a numeric keyword on a non-number field', () => {
    expect(() =>
      validateResourceDefinition(def({ name: { type: 'string', minimum: 0 } })),
    ).toThrow(/declares "minimum" but is not a number/);
  });

  it('rejects a string keyword on a non-string field', () => {
    expect(() =>
      validateResourceDefinition(def({ count: { type: 'number', minLength: 2 } })),
    ).toThrow(/declares "minLength" but is not a string/);
  });

  it('rejects an array keyword on a non-array field', () => {
    expect(() =>
      validateResourceDefinition(def({ name: { type: 'string', minItems: 1 } })),
    ).toThrow(/declares "minItems" but is not an array/);
  });

  it('rejects minimum greater than maximum', () => {
    expect(() =>
      validateResourceDefinition(def({ amount: { type: 'number', minimum: 10, maximum: 1 } })),
    ).toThrow(/minimum must not exceed maximum/);
  });

  it('rejects a negative or non-integer length', () => {
    expect(() =>
      validateResourceDefinition(def({ code: { type: 'string', maxLength: -1 } })),
    ).toThrow(/maxLength must be a non-negative integer/);
  });

  it('rejects a non-positive multipleOf', () => {
    expect(() =>
      validateResourceDefinition(def({ qty: { type: 'integer', multipleOf: 0 } })),
    ).toThrow(/multipleOf must be a positive number/);
  });

  it('rejects an uncompilable pattern', () => {
    expect(() =>
      validateResourceDefinition(def({ code: { type: 'string', pattern: '[' } })),
    ).toThrow(/pattern is not a valid regular expression/);
  });

  it('accepts a well-formed set of constraints', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          amount: { type: 'number', minimum: 0, maximum: 100 },
          code: { type: 'string', minLength: 2, maxLength: 4, pattern: '^[A-Z]+$' },
          tags: { type: 'array', minItems: 1, items: { type: 'string' } },
        }),
      ),
    ).not.toThrow();
  });
});

describe('files below the top level', () => {
  const def = (fields: ResourceDefinition['fields']): ResourceDefinition => ({
    singular: 'scrapbook',
    plural: 'scrapbooks',
    fields,
  });

  it('marks a file wherever it sits', () => {
    const wire = toWireSchema(
      {
        attachments: {
          type: 'array',
          maxItems: 5,
          items: { type: 'file' },
        },
        profile: { type: 'object', properties: { avatar: { type: 'file', required: true } } },
        pages: {
          type: 'array',
          items: { type: 'object', properties: { scan: { type: 'file' }, caption: { type: 'string' } } },
        },
      },
      'scrapbook',
    );
    expect(wire.properties.attachments).toEqual({
      type: 'array',
      maxItems: 5,
      items: { type: 'binary', 'x-aepbase-file-field': true },
    });
    expect(wire.properties.profile).toEqual({
      type: 'object',
      properties: { avatar: { type: 'binary', 'x-aepbase-file-field': true } },
      required: ['avatar'],
    });
    expect(wire.properties.pages.items?.properties?.scan).toEqual({
      type: 'binary',
      'x-aepbase-file-field': true,
    });
  });

  it('accepts lists, objects and lists of objects', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          attachments: { type: 'array', items: { type: 'file' } },
          profile: { type: 'object', properties: { avatar: { type: 'file' } } },
          pages: { type: 'array', items: { type: 'object', properties: { scan: { type: 'file' } } } },
        }),
      ),
    ).not.toThrow();
  });

  it('refuses a file inside a tagged-union variant', () => {
    expect(() =>
      validateResourceDefinition(
        def({
          meta: {
            type: 'object',
            discriminator: 'kind',
            variants: { scan: { image: { type: 'file' } } },
          },
        }),
      ),
    ).toThrow(/file inside a tagged-union variant/);
  });

  it('keeps ai options to a top-level file', () => {
    expect(() =>
      validateResourceDefinition(
        def({ attachments: { type: 'array', items: { type: 'file', ai: { embed: true } } } }),
      ),
    ).toThrow(/only a top-level file may/);
  });
});
