import { useMemo } from 'react';
import { useHSAReceipts } from './useHSAReceipts';
import type { HSAStats, CategoryBreakdown, PatientBreakdown, HSAReceipt } from '../types';

function groupByKey<K>(
  receipts: HSAReceipt[],
  keyFn: (r: HSAReceipt) => K,
): Map<K, { total: number; count: number }> {
  const map = new Map<K, { total: number; count: number }>();
  for (const r of receipts) {
    const key = keyFn(r);
    const existing = map.get(key) ?? { total: 0, count: 0 };
    map.set(key, { total: existing.total + r.amount, count: existing.count + 1 });
  }
  return map;
}

export function useHSAStats() {
  const { data: receipts, ...queryResult } = useHSAReceipts();

  const stats: HSAStats | undefined = useMemo(() => {
    if (!receipts) return undefined;

    const stored = receipts.filter((r) => r.status === 'Stored');
    const reimbursed = receipts.filter((r) => r.status === 'Reimbursed');
    const sum = (items: HSAReceipt[]) => items.reduce((acc, r) => acc + r.amount, 0);

    const categoryBreakdown: CategoryBreakdown[] = Array.from(
      groupByKey(receipts, (r) => r.category).entries(),
    ).map(([category, data]) => ({ category, ...data }));

    const patientBreakdown: PatientBreakdown[] = Array.from(
      groupByKey(receipts, (r) => r.patient || 'Unknown').entries(),
    ).map(([patient, data]) => ({ patient, ...data }));

    return {
      totalStored: sum(stored),
      totalReimbursed: sum(reimbursed),
      totalReceipts: receipts.length,
      storedReceipts: stored.length,
      reimbursedReceipts: reimbursed.length,
      categoryBreakdown,
      patientBreakdown,
    };
  }, [receipts]);

  return { stats, ...queryResult };
}
