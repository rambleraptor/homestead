/**
 * The charitable tab's arithmetic. These are the rules that decide the number
 * someone copies onto a tax return, so each one is pinned here rather than left
 * to the components that render it.
 */

import { describe, it, expect } from 'vitest';
import {
  computeCharitableStats,
  deductibleAmount,
  defaultYear,
  effectiveYear,
  needsAcknowledgment,
  summarizeOrganizations,
  summarizeYears,
} from '../charitable/stats';
import type { CharitableReceipt } from '../charitable/types';

function receipt(overrides: Partial<CharitableReceipt> = {}): CharitableReceipt {
  return {
    id: 'r1',
    organization: 'Food Bank',
    donation_date: '2025-06-01T00:00:00.000Z',
    gift_type: 'Cash',
    amount: 100,
    status: 'Unclaimed',
    receipt_file: 'ack.pdf',
    created: '',
    updated: '',
    ...overrides,
  };
}

describe('effectiveYear', () => {
  it('prefers the stated tax year over the donation date', () => {
    // The December-check case: sent in 2024, acknowledged in 2025.
    expect(
      effectiveYear(
        receipt({ donation_date: '2025-01-04T00:00:00.000Z', tax_year: 2024 }),
      ),
    ).toBe(2024);
  });

  it('falls back to the donation date when no tax year is stated', () => {
    expect(effectiveYear(receipt({ donation_date: '2023-11-02T00:00:00.000Z' }))).toBe(
      2023,
    );
  });

  it('returns undefined for an unparseable date, rather than NaN', () => {
    expect(effectiveYear(receipt({ donation_date: 'sometime last spring' }))).toBeUndefined();
  });
});

describe('deductibleAmount', () => {
  it('subtracts the value of anything received in return', () => {
    expect(deductibleAmount(receipt({ amount: 250, value_received: 60 }))).toBe(190);
  });

  it('is zero for a gift nobody has valued yet', () => {
    expect(deductibleAmount(receipt({ gift_type: 'Goods', amount: undefined }))).toBe(0);
  });

  it('never goes negative when the benefit exceeds the gift', () => {
    expect(deductibleAmount(receipt({ amount: 50, value_received: 80 }))).toBe(0);
  });
});

describe('needsAcknowledgment', () => {
  it('flags a $250-or-more gift with nothing on file', () => {
    expect(
      needsAcknowledgment(
        receipt({ amount: 250, receipt_file: undefined, source_document: undefined }),
      ),
    ).toBe(true);
  });

  it('accepts a source document in place of an uploaded file', () => {
    expect(
      needsAcknowledgment(
        receipt({ amount: 900, receipt_file: undefined, source_document: 'documents/d1' }),
      ),
    ).toBe(false);
  });

  it('leaves a small undocumented gift alone', () => {
    expect(
      needsAcknowledgment(receipt({ amount: 40, receipt_file: undefined })),
    ).toBe(false);
  });
});

describe('summarizeYears', () => {
  it('splits cash from non-cash and sorts newest first', () => {
    const years = summarizeYears([
      receipt({ id: 'a', amount: 100 }),
      receipt({ id: 'b', amount: 50, gift_type: 'Goods' }),
      receipt({ id: 'c', donation_date: '2024-03-01T00:00:00.000Z', amount: 75 }),
    ]);

    expect(years).toEqual([
      { year: 2025, total: 150, cash: 100, nonCash: 50, count: 2 },
      { year: 2024, total: 75, cash: 75, nonCash: 0, count: 1 },
    ]);
  });

  it('skips a receipt whose year cannot be determined', () => {
    expect(summarizeYears([receipt({ donation_date: 'nonsense' })])).toEqual([]);
  });
});

describe('summarizeOrganizations', () => {
  it('groups by organization, largest first', () => {
    expect(
      summarizeOrganizations([
        receipt({ id: 'a', organization: 'Food Bank', amount: 100 }),
        receipt({ id: 'b', organization: 'Library Fund', amount: 300 }),
        receipt({ id: 'c', organization: 'Food Bank', amount: 25 }),
      ]),
    ).toEqual([
      { organization: 'Library Fund', total: 300, count: 1 },
      { organization: 'Food Bank', total: 125, count: 2 },
    ]);
  });

  it('buckets a blank organization rather than dropping the gift', () => {
    expect(summarizeOrganizations([receipt({ organization: '  ' })])).toEqual([
      { organization: 'Unknown', total: 100, count: 1 },
    ]);
  });
});

describe('computeCharitableStats', () => {
  const receipts = [
    receipt({ id: 'a', amount: 400, value_received: 60 }),
    receipt({ id: 'b', organization: 'Shelter', gift_type: 'Goods', amount: 80 }),
    // Unvalued goods: counted as a receipt, worth nothing until valued.
    receipt({ id: 'c', gift_type: 'Goods', amount: undefined }),
    // Big, undocumented — the acknowledgment warning.
    receipt({ id: 'd', amount: 500, receipt_file: undefined }),
    // A different year entirely.
    receipt({ id: 'e', donation_date: '2024-05-05T00:00:00.000Z', amount: 90 }),
  ];

  it('scopes every figure to the selected year but keeps all years listed', () => {
    const stats = computeCharitableStats(receipts, 2025);

    expect(stats.year).toBe(2025);
    expect(stats.total).toBe(920); // 340 + 80 + 0 + 500
    expect(stats.cash).toBe(840);
    expect(stats.nonCash).toBe(80);
    expect(stats.count).toBe(4);
    expect(stats.unvalued).toBe(1);
    expect(stats.missingAcknowledgment).toBe(1);
    expect(stats.years.map((y) => y.year)).toEqual([2025, 2024]);
  });

  it('reports an empty year without pretending it has no history', () => {
    const stats = computeCharitableStats(receipts, 2020);
    expect(stats.total).toBe(0);
    expect(stats.count).toBe(0);
    expect(stats.years).toHaveLength(2);
  });
});

describe('donor-advised fund grants', () => {
  const daf = receipt({ id: 'daf', source: 'DAF', amount: 1000, receipt_file: undefined });

  it('are not deductible — the deduction was taken when the fund was funded', () => {
    expect(deductibleAmount(daf)).toBe(0);
  });

  it('never need an acknowledgment, however large', () => {
    expect(needsAcknowledgment(daf)).toBe(false);
  });

  it('read a receipt with no source as paid directly', () => {
    expect(deductibleAmount(receipt({ amount: 100 }))).toBe(100);
  });

  it('are totalled apart from the deduction and from the cash and non-cash counts', () => {
    const stats = computeCharitableStats([receipt({ amount: 100 }), daf], 2025);
    expect(stats.total).toBe(100);
    expect(stats.cash).toBe(100);
    expect(stats.cashCount).toBe(1);
    expect(stats.dafGranted).toBe(1000);
    expect(stats.dafCount).toBe(1);
    expect(stats.count).toBe(2);
    expect(stats.missingAcknowledgment).toBe(0);
  });
});

describe('defaultYear', () => {
  const years = [
    { year: 2024, total: 0, cash: 0, nonCash: 0, count: 1 },
    { year: 2022, total: 0, cash: 0, nonCash: 0, count: 1 },
  ];

  it('opens on the current year when it has giving in it', () => {
    expect(defaultYear([{ ...years[0], year: 2025 }, ...years], 2025)).toBe(2025);
  });

  it('falls back to the most recent year with giving', () => {
    expect(defaultYear(years, 2025)).toBe(2024);
  });

  it('uses the current year when there is nothing at all', () => {
    expect(defaultYear([], 2025)).toBe(2025);
  });
});
