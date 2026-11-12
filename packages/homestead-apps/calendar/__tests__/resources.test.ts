/**
 * Guards that the calendar resource definitions stay valid for the boot-time
 * schema sync: each definition passes name/field validation, translates to a
 * wire schema, and its references resolve.
 */

import { describe, expect, it } from 'vitest';
import {
  toWireSchema,
  validateReferenceTargets,
  validateResourceDefinition,
} from '@rambleraptor/homestead-core/resources/translate';
import { BUILTIN_RESOURCE_DEFS } from '@rambleraptor/homestead-core/resources/builtins';
import { calendarResources } from '../resources';

const byName = (singular: string) => calendarResources.find((r) => r.singular === singular)!;

describe('calendar resource definitions', () => {
  it('each definition passes validation', () => {
    for (const def of calendarResources) {
      expect(() => validateResourceDefinition(def)).not.toThrow();
    }
  });

  it('each definition translates to a wire schema', () => {
    for (const def of calendarResources) {
      expect(() => toWireSchema(def.fields, def.singular)).not.toThrow();
    }
  });

  it('references resolve, including an event’s reference to its own series', () => {
    expect(() =>
      validateReferenceTargets([...calendarResources, ...BUILTIN_RESOURCE_DEFS]),
    ).not.toThrow();
  });

  it('nests events under their calendar', () => {
    expect(byName('calendar-event').parents).toEqual(['calendar']);
  });

  it('requires a title, a start and an end on an event', () => {
    const def = byName('calendar-event');
    expect(toWireSchema(def.fields, def.singular).required).toEqual(
      expect.arrayContaining(['title', 'start', 'end']),
    );
  });
});
