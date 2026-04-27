/**
 * Create HSA Receipt via multipart upload.
 */

import { AepCollections } from '@/core/api/aepbase';
import { currentUserPath, useAepCreate } from '@/core/api/resourceHooks';
import type { HSAReceipt, HSAReceiptFormData } from '../types';

export function useCreateHSAReceipt() {
  return useAepCreate<HSAReceipt, HSAReceiptFormData>(
    AepCollections.HSA_RECEIPTS,
    {
      moduleId: 'hsa',
      transform: (data) => {
        const resource: Record<string, unknown> = {
          merchant: data.merchant,
          service_date: data.service_date,
          amount: data.amount,
          category: data.category,
          status: data.status,
        };
        if (data.patient) resource.patient = data.patient;
        if (data.notes) resource.notes = data.notes;
        const createdBy = currentUserPath();
        if (createdBy) resource.created_by = createdBy;

        const formData = new FormData();
        formData.append('resource', JSON.stringify(resource));
        if (data.receipt_file) formData.append('receipt_file', data.receipt_file);
        return formData;
      },
    },
  );
}
