/**
 * Guards that the home resource definitions stay valid for the boot-time schema
 * sync: each definition passes name/field validation, translates to a wire
 * schema, and its references resolve against the wider resource set.
 */

import { describe, it, expect } from 'vitest';
import {
  toWireSchema,
  validateReferenceTargets,
  validateResourceDefinition,
} from '@rambleraptor/homestead-core/resources/translate';
import { BUILTIN_RESOURCE_DEFS } from '@rambleraptor/homestead-core/resources/builtins';
import { todosResources } from '../../todos/resources';
import {
  GARBAGE_STREAMS,
  HOME_TASK_INTERVAL_UNITS,
  homeResources,
} from '../resources';

describe('home resource definitions', () => {
  it('each definition passes validation', () => {
    for (const def of homeResources) {
      expect(() => validateResourceDefinition(def)).not.toThrow();
    }
  });

  it('each definition translates to a wire schema', () => {
    for (const def of homeResources) {
      expect(() => toWireSchema(def.fields, def.singular)).not.toThrow();
    }
  });

  it('references resolve against the full resource set', () => {
    // `device-info.charge_todo` points into the todos app.
    expect(() =>
      validateReferenceTargets([...homeResources, ...todosResources, ...BUILTIN_RESOURCE_DEFS]),
    ).not.toThrow();
  });

  it('garbage-pickup requires a date and a stream', () => {
    const def = homeResources[0]!;
    const wire = toWireSchema(def.fields, def.singular);
    expect(wire.required).toEqual(
      expect.arrayContaining(['pickup_date', 'stream']),
    );
  });

  it('encodes the stream enum into the wire description, since aepbase strips enum', () => {
    const def = homeResources[0]!;
    const wire = toWireSchema(def.fields, def.singular);
    expect(wire.properties.stream?.description).toContain('one of:');
    for (const stream of GARBAGE_STREAMS) {
      expect(wire.properties.stream?.description).toContain(stream);
    }
  });

  it('stream enum values are kebab-case, matching the aepbase naming rule', () => {
    for (const stream of GARBAGE_STREAMS) {
      expect(stream).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  describe('home-task', () => {
    const def = homeResources.find((r) => r.singular === 'home-task')!;

    it('requires the three things a schedule cannot exist without', () => {
      const wire = toWireSchema(def.fields, def.singular);
      expect(wire.required).toEqual(
        expect.arrayContaining(['name', 'interval_count', 'interval_unit', 'next_due']),
      );
    });

    it('encodes the interval enum into the wire description, since aepbase strips enum', () => {
      const wire = toWireSchema(def.fields, def.singular);
      expect(wire.properties.interval_unit?.description).toContain('one of:');
      for (const unit of HOME_TASK_INTERVAL_UNITS) {
        expect(wire.properties.interval_unit?.description).toContain(unit);
      }
    });

    it('keeps the notes field optional — a reminder is useful without them', () => {
      const wire = toWireSchema(def.fields, def.singular);
      expect(wire.required ?? []).not.toContain('notes');
      expect(wire.properties.notes?.type).toBe('string');
    });

    it('bounds the interval and the lead time so a bad write is refused at the engine', () => {
      const wire = toWireSchema(def.fields, def.singular);
      expect(wire.properties.interval_count?.minimum).toBe(1);
      expect(wire.properties.lead_days?.minimum).toBe(0);
      expect(wire.properties.lead_days?.maximum).toBe(90);
    });
  });

  describe('device-info', () => {
    const def = homeResources.find((r) => r.singular === 'device-info')!;

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
});
