/**
 * Create HSA Receipt via multipart upload.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { HSAReceipt, HSAReceiptFormData } from '../types';

export function useCreateHSAReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: HSAReceiptFormData) => {
      const userId = aepbase.getCurrentUser()?.id;
      const resource: Record<string, unknown> = {
        merchant: data.merchant,
        service_date: data.service_date,
        amount: data.amount,
        category: data.category,
        status: data.status,
      };
      if (data.patient) resource.patient = data.patient;
      if (data.notes) resource.notes = data.notes;
      if (userId) resource.created_by = `users/${userId}`;

      const formData = new FormData();
      formData.append('resource', JSON.stringify(resource));
      if (data.receipt_file) formData.append('receipt_file', data.receipt_file);

      return await aepbase.create<HSAReceipt>(AepCollections.HSA_RECEIPTS, formData);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.module('hsa').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.module('hsa').all() });
      logger.info('HSA receipt created successfully');
    },
    onError: (error) => logger.error('Failed to create HSA receipt', error),
  });
}
