import { describe, expect, it } from 'vitest';
import {
  DUE_SOON_DAYS,
  daysUntil,
  dueSoon,
  dueStatus,
  isDueSatisfied,
  seriesDueStatus,
  todayIso,
} from '../utils/due';
import type { Vaccine } from '../types';

const TODAY = '2026-08-31';

function makeVaccine(id: string, nextDue?: string): Vaccine {
  return {
    id,
    path: `vaccines/${id}`,
    name: `Vaccine ${id}`,
    next_due: nextDue,
    create_time: '2026-01-01T00:00:00Z',
    update_time: '2026-01-01T00:00:00Z',
  };
}

describe('daysUntil', () => {
  it('counts whole days between ISO dates', () => {
    expect(daysUntil('2026-09-01', TODAY)).toBe(1);
    expect(daysUntil('2026-08-31', TODAY)).toBe(0);
    expect(daysUntil('2026-08-30', TODAY)).toBe(-1);
  });

  it('spans month and year boundaries', () => {
    expect(daysUntil('2027-08-31', TODAY)).toBe(365);
  });

  it('returns null for an unparseable date', () => {
    expect(daysUntil('soon', TODAY)).toBeNull();
    expect(daysUntil('2026-09-01', 'not-a-date')).toBeNull();
  });
});

describe('dueStatus', () => {
  it('is none without a due date', () => {
    expect(dueStatus(undefined, TODAY)).toBe('none');
    expect(dueStatus('', TODAY)).toBe('none');
  });

  it('is none for an unparseable due date', () => {
    expect(dueStatus('whenever', TODAY)).toBe('none');
  });

  it('is overdue for a past date', () => {
    expect(dueStatus('2026-08-30', TODAY)).toBe('overdue');
  });

  it('is due-soon from today through the window edge', () => {
    expect(dueStatus(TODAY, TODAY)).toBe('due-soon');
    expect(dueStatus('2026-10-30', TODAY)).toBe('due-soon'); // exactly DUE_SOON_DAYS out
  });

  it('is ok past the window', () => {
    expect(dueStatus('2026-10-31', TODAY)).toBe('ok'); // DUE_SOON_DAYS + 1
    expect(DUE_SOON_DAYS).toBe(60);
  });
});

describe('dueSoon', () => {
  it('keeps only overdue and due-soon vaccines, soonest first', () => {
    const records = [
      makeVaccine('far', '2027-01-01'),
      makeVaccine('soon', '2026-09-15'),
      makeVaccine('past', '2026-08-01'),
      makeVaccine('never'),
    ];
    expect(dueSoon(records, TODAY).map((v) => v.id)).toEqual(['past', 'soon']);
  });

  it('returns an empty array when nothing is due', () => {
    expect(dueSoon([makeVaccine('a'), makeVaccine('b', '2027-06-01')], TODAY)).toEqual([]);
  });
});

describe('todayIso', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 7, 31, 23, 59))).toBe('2026-08-31');
    expect(todayIso(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
  });
});

describe('isDueSatisfied', () => {
  it('is met by a dose on or after the due date', () => {
    expect(isDueSatisfied('2026-01-15', '2026-01-15')).toBe(true);
    expect(isDueSatisfied('2026-01-15', '2026-02-01')).toBe(true);
  });

  it('is not met by an earlier dose, no dose, or no due date', () => {
    expect(isDueSatisfied('2026-01-15', '2026-01-14')).toBe(false);
    expect(isDueSatisfied('2026-01-15', undefined)).toBe(false);
    expect(isDueSatisfied(undefined, '2026-02-01')).toBe(false);
    expect(isDueSatisfied('soon', '2026-02-01')).toBe(false);
  });
});

describe('seriesDueStatus', () => {
  it('clears an overdue date once a dose has met it', () => {
    expect(seriesDueStatus('2026-01-15', undefined, TODAY)).toBe('overdue');
    expect(seriesDueStatus('2026-01-15', '2026-01-10', TODAY)).toBe('overdue');
    expect(seriesDueStatus('2026-01-15', '2026-02-01', TODAY)).toBe('none');
  });

  it('otherwise reads like dueStatus', () => {
    expect(seriesDueStatus('2026-09-10', '2025-09-10', TODAY)).toBe('due-soon');
    expect(seriesDueStatus(undefined, '2025-09-10', TODAY)).toBe('none');
  });
});
