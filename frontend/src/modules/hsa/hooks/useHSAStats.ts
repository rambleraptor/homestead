/**
 * Hook for computing HSA statistics
 */

import { useMemo } from 'react';
import { useHSAReceipts } from './useHSAReceipts';
import type { HSAStats, CategoryBreakdown, PatientBreakdown, ReceiptCategory } from '../types';

export function useHSAStats() {
  const { data: receipts, ...queryResult } = useHSAReceipts();

  const stats: HSAStats | undefined = useMemo(() => {
    if (!receipts) return undefined;

    // Calculate totals
    const totalStored = receipts
      .filter((r) => r.status === 'Stored')
      .reduce((sum, r) => sum + r.amount, 0);

    const totalReimbursed = receipts
      .filter((r) => r.status === 'Reimbursed')
      .reduce((sum, r) => sum + r.amount, 0);

    const storedReceipts = receipts.filter((r) => r.status === 'Stored').length;
    const reimbursedReceipts = receipts.filter((r) => r.status === 'Reimbursed').length;

    // Category breakdown
    const categoryMap = new Map<ReceiptCategory, { total: number; count: number }>();
    receipts.forEach((receipt) => {
      const existing = categoryMap.get(receipt.category) || { total: 0, count: 0 };
      categoryMap.set(receipt.category, {
        total: existing.total + receipt.amount,
        count: existing.count + 1,
      });
    });

    const categoryBreakdown: CategoryBreakdown[] = Array.from(categoryMap.entries()).map(
      ([category, data]) => ({
        category,
        total: data.total,
        count: data.count,
      })
    );

    // Patient breakdown
    const patientMap = new Map<string, { total: number; count: number }>();
    receipts.forEach((receipt) => {
      const patient = receipt.patient || 'Unknown';
      const existing = patientMap.get(patient) || { total: 0, count: 0 };
      patientMap.set(patient, {
        total: existing.total + receipt.amount,
        count: existing.count + 1,
      });
    });

    const patientBreakdown: PatientBreakdown[] = Array.from(patientMap.entries()).map(
      ([patient, data]) => ({
        patient,
        total: data.total,
        count: data.count,
      })
    );

    return {
      totalStored,
      totalReimbursed,
      totalReceipts: receipts.length,
      storedReceipts,
      reimbursedReceipts,
      categoryBreakdown,
      patientBreakdown,
    };
  }, [receipts]);

  return { stats, ...queryResult };
}
