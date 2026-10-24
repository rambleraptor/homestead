/**
 * Retention: the boot validation that guards a scheduled delete, and the pure
 * helpers the sweep is built from. The sweep itself runs against a real engine
 * in `homestead-server/test/retention.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { validateResourceDefinition } from '../translate';
import {
  isExpired,
  retainedResources,
  retentionCutoff,
  retentionFilter,
} from '../retention';
import type { ResourceDefinition } from '../types';
import { operationsApp } from '../../operations/app.config';
import { operationsResources } from '../../operations/resources';

const thread = (overrides: Partial<ResourceDefinition> = {}): ResourceDefinition => ({
  singular: 'thread',
  plural: 'threads',
  fields: {
    title: { type: 'string' },
    last_at: { type: 'string', format: 'date-time' },
  },
  retention: { days: 60 },
  ...overrides,
});

describe('retention boot validation', () => {
  it('accepts a window on update_time or on a declared date-time field', () => {
    expect(() => validateResourceDefinition(thread())).not.toThrow();
    expect(() =>
      validateResourceDefinition(thread({ retention: { days: 60, field: 'last_at' } })),
    ).not.toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects days = %s', (days) => {
    expect(() => validateResourceDefinition(thread({ retention: { days } }))).toThrow(
      /positive integer/,
    );
  });

  it('rejects a child resource — it goes when its parent does', () => {
    expect(() => validateResourceDefinition(thread({ parents: ['board'] }))).toThrow(
      /top-level resource/,
    );
  });

  it('accepts the engine timestamps as the field, and a where condition', () => {
    expect(() =>
      validateResourceDefinition(
        thread({ retention: { days: 3, field: 'create_time', where: 'done == true' } }),
      ),
    ).not.toThrow();
  });

  it('rejects a blank where — omit it to sweep every row', () => {
    expect(() =>
      validateResourceDefinition(thread({ retention: { days: 3, where: '  ' } })),
    ).toThrow(/non-empty filter/);
  });

  it('rejects a field that is missing or not a date-time', () => {
    expect(() =>
      validateResourceDefinition(thread({ retention: { days: 1, field: 'nope' } })),
    ).toThrow(/not a declared field/);
    expect(() =>
      validateResourceDefinition(thread({ retention: { days: 1, field: 'title' } })),
    ).toThrow(/format "date-time"/);
  });
});

describe('retention helpers', () => {
  it('computes the cutoff in the engine timestamp format', () => {
    expect(retentionCutoff('2026-10-24T03:00:00Z', 60)).toBe('2026-08-25T03:00:00Z');
    expect(retentionCutoff('2026-10-24T03:00:00.987Z', 1)).toBe('2026-10-23T03:00:00Z');
  });

  it('filters on update_time, or on the field with an update_time fallback', () => {
    const cutoff = '2026-08-25T03:00:00Z';
    expect(retentionFilter({ days: 60 }, cutoff)).toBe('update_time < "2026-08-25T03:00:00Z"');
    expect(retentionFilter({ days: 60, field: 'last_at' }, cutoff)).toBe(
      'last_at < "2026-08-25T03:00:00Z" || update_time < "2026-08-25T03:00:00Z"',
    );
  });

  it('needs no fallback on an engine timestamp, and ANDs in a where', () => {
    const cutoff = '2026-08-25T03:00:00Z';
    expect(retentionFilter({ days: 3, field: 'create_time', where: 'done == true' }, cutoff)).toBe(
      '(done == true) && (create_time < "2026-08-25T03:00:00Z")',
    );
  });

  it('judges a row by its field when set, else by update_time', () => {
    const cutoff = '2026-08-25T03:00:00Z';
    const r = { days: 60, field: 'last_at' };
    expect(isExpired({ last_at: '2026-08-01T00:00:00Z', update_time: '2026-10-20T00:00:00Z' }, r, cutoff)).toBe(true);
    expect(isExpired({ last_at: '2026-10-01T00:00:00.000Z', update_time: '2026-01-01T00:00:00Z' }, r, cutoff)).toBe(false);
    expect(isExpired({ update_time: '2026-01-01T00:00:00Z' }, r, cutoff)).toBe(true);
    expect(isExpired({ last_at: '', update_time: '2026-10-20T00:00:00Z' }, r, cutoff)).toBe(false);
    expect(isExpired({}, r, cutoff)).toBe(false);
  });

  it('sweeps only top-level resources that declare a window', () => {
    const defs = [thread(), thread({ singular: 'plain', plural: 'plains', retention: undefined })];
    expect(retainedResources(defs).map((d) => d.singular)).toEqual(['thread']);
  });

  it('is scheduled daily on the always-installed Operations app', () => {
    const hook = operationsApp.crons?.find((c) => c.id === 'resource-retention');
    expect(hook).toMatchObject({ dailyAtHour: 3, runOnStart: true });
  });

  it('is how operations are cleaned up — no hand-rolled cron of their own', () => {
    expect(operationsResources[0]?.retention).toEqual({
      days: 3,
      field: 'create_time',
      where: 'done == true',
    });
    expect(operationsApp.crons?.map((c) => c.id)).toEqual(['resource-retention']);
    expect(() => validateResourceDefinition(operationsResources[0]!)).not.toThrow();
  });
});
