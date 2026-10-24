/**
 * The `access` declaration: its boot validation and how it reaches the wire.
 *
 * The validation matters more than it looks. A bad `per-record` declaration
 * doesn't fail loudly at runtime — it produces a grant filter that matches
 * nothing, and every row of the collection quietly becomes invisible to
 * everyone but its owner. These tests are the reason that can't ship.
 */

import { describe, it, expect } from 'vitest';
import { toWireSchema, validateResourceDefinition } from '../translate';
import type { ResourceDefinition } from '../types';

/** A valid per-record resource; each test perturbs one thing. */
function def(overrides: Partial<ResourceDefinition> = {}): ResourceDefinition {
  return {
    singular: 'thing',
    plural: 'things',
    access: {
      model: 'per-record',
      field: 'visibility',
      sharedValue: 'household',
      privateValue: 'private',
    },
    fields: {
      name: { type: 'string', required: true },
      visibility: {
        type: 'string',
        enum: ['private', 'household'],
        default: 'household',
        immutable: true,
      },
    },
    ...overrides,
  };
}

describe('access declaration validation', () => {
  it('accepts a well-formed per-record resource', () => {
    expect(() => validateResourceDefinition(def())).not.toThrow();
  });

  it('accepts shared and private, which declare no field', () => {
    for (const access of [{ model: 'shared' } as const, { model: 'private' } as const]) {
      expect(() =>
        validateResourceDefinition({
          singular: 'thing',
          plural: 'things',
          access,
          fields: { name: { type: 'string' } },
        }),
      ).not.toThrow();
    }
  });

  it('accepts a resource with no access declaration at all', () => {
    expect(() =>
      validateResourceDefinition({
        singular: 'thing',
        plural: 'things',
        fields: { name: { type: 'string' } },
      }),
    ).not.toThrow();
  });

  it('rejects a field that is not declared', () => {
    const d = def();
    (d.access as { field: string }).field = 'nope';
    expect(() => validateResourceDefinition(d)).toThrow(/not a declared field/);
  });

  it('rejects a non-string discriminator', () => {
    const d = def();
    d.fields.visibility = { type: 'boolean', default: true, immutable: true };
    expect(() => validateResourceDefinition(d)).toThrow(/must be a string field/);
  });

  it('rejects a discriminator with no enum', () => {
    const d = def();
    d.fields.visibility = { type: 'string', default: 'household', immutable: true };
    expect(() => validateResourceDefinition(d)).toThrow(/must declare an enum/);
  });

  it('rejects an enum missing either declared value', () => {
    const d = def();
    d.fields.visibility = {
      type: 'string',
      enum: ['household'],
      default: 'household',
      immutable: true,
    };
    expect(() => validateResourceDefinition(d)).toThrow(/does not include "private"/);
  });

  it('rejects a discriminator with no default', () => {
    const d = def();
    d.fields.visibility = {
      type: 'string',
      enum: ['private', 'household'],
      immutable: true,
    };
    expect(() => validateResourceDefinition(d)).toThrow(/must declare a default/);
  });

  it('rejects a default outside the two declared values', () => {
    const d = def();
    d.fields.visibility = {
      type: 'string',
      enum: ['private', 'household', 'secret'],
      default: 'secret',
      immutable: true,
    };
    expect(() => validateResourceDefinition(d)).toThrow(/must be either/);
  });

  it('rejects a required discriminator', () => {
    const d = def();
    d.fields.visibility = {
      type: 'string',
      enum: ['private', 'household'],
      default: 'household',
      immutable: true,
      required: true,
    };
    expect(() => validateResourceDefinition(d)).toThrow(/must not be required/);
  });

  it('rejects a mutable discriminator', () => {
    const d = def();
    d.fields.visibility = {
      type: 'string',
      enum: ['private', 'household'],
      default: 'household',
    };
    expect(() => validateResourceDefinition(d)).toThrow(/must be immutable/);
  });

  it('rejects identical shared and private values', () => {
    const d = def();
    (d.access as { privateValue: string }).privateValue = 'household';
    expect(() => validateResourceDefinition(d)).toThrow(/must differ/);
  });

  it('rejects per-record on a user-parented resource', () => {
    // Path scoping already governs there; the grant filter would be inert.
    expect(() => validateResourceDefinition(def({ parents: ['user'] }))).toThrow(
      /not valid on a user-parented resource/,
    );
  });
});

describe('immutable on the wire', () => {
  it('marks the property so the engine can refuse later writes', () => {
    const d = def();
    const wire = toWireSchema(d.fields, d.singular);
    expect(wire.properties.visibility?.['x-aepbase-immutable']).toBe(true);
  });

  it('leaves ordinary fields unmarked', () => {
    const d = def();
    const wire = toWireSchema(d.fields, d.singular);
    expect(wire.properties.name?.['x-aepbase-immutable']).toBeUndefined();
  });
});

describe('parent access inheritance', () => {
  const plain = (overrides: Partial<ResourceDefinition> = {}): ResourceDefinition => ({
    singular: 'thing',
    plural: 'things',
    fields: { name: { type: 'string', required: true } },
    ...overrides,
  });

  it('accepts independent_access on a child of an ordinary parent', () => {
    expect(() =>
      validateResourceDefinition(plain({ parents: ['box'], independent_access: true })),
    ).not.toThrow();
  });

  it('rejects independent_access without a parent', () => {
    expect(() => validateResourceDefinition(plain({ independent_access: true }))).toThrow(
      /needs a parent/,
    );
  });

  it('rejects independent_access under user, whose subtree is scoped by path', () => {
    expect(() =>
      validateResourceDefinition(plain({ parents: ['user'], independent_access: true })),
    ).toThrow(/not valid on a user-parented resource/);
  });

  it('rejects per-record on an inheriting child — its discriminator would decide nothing', () => {
    expect(() => validateResourceDefinition(def({ parents: ['box'] }))).toThrow(
      /inherits its parent's access/,
    );
  });

  it('accepts per-record on a child that opts out of inheritance', () => {
    expect(() =>
      validateResourceDefinition(def({ parents: ['box'], independent_access: true })),
    ).not.toThrow();
  });

  it('accepts shared and private on an inheriting child (they only shape the seeded grant)', () => {
    expect(() =>
      validateResourceDefinition(plain({ parents: ['box'], access: { model: 'private' } })),
    ).not.toThrow();
  });
});
