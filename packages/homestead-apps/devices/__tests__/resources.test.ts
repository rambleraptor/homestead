/**
 * Guards that `device-info` stays valid for the boot-time schema sync, and that
 * its `charge_todo` reference resolves against the todos app it depends on.
 */

import { describe, it, expect } from 'vitest';
import {
  toWireSchema,
  validateReferenceTargets,
  validateResourceDefinition,
} from '@rambleraptor/homestead-core/resources/translate';
import { BUILTIN_RESOURCE_DEFS } from '@rambleraptor/homestead-core/resources/builtins';
import { todosResources } from '../../todos/resources';
import { devicesResources } from '../resources';

describe('devices resource definitions', () => {
  const def = devicesResources[0]!;

  it('passes validation and translates to a wire schema', () => {
    expect(() => validateResourceDefinition(def)).not.toThrow();
    expect(() => toWireSchema(def.fields, def.singular)).not.toThrow();
  });

  it('references resolve against the todos app and the built-ins', () => {
    expect(() =>
      validateReferenceTargets([...devicesResources, ...todosResources, ...BUILTIN_RESOURCE_DEFS]),
    ).not.toThrow();
  });

  it('requires only a name, so a device can report whatever it can read', () => {
    const wire = toWireSchema(def.fields, def.singular);
    expect(wire.required).toEqual(['name']);
  });

  it('bounds the battery reading at the engine', () => {
    const wire = toWireSchema(def.fields, def.singular);
    expect(wire.properties.battery_percent?.minimum).toBe(0);
    expect(wire.properties.battery_percent?.maximum).toBe(100);
  });
});
