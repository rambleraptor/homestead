/**
 * Hook for creating HSA receipts
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, Collections, getCurrentUser } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { HSAReceipt, HSAReceiptFormData } from '../types';

export function useCreateHSAReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: HSAReceiptFormData) => {
      const currentUser = getCurrentUser();

      // Build FormData for file upload
      const formData = new FormData();
      formData.append('merchant', data.merchant);
      formData.append('service_date', data.service_date);
      formData.append('amount', data.amount.toString());
      formData.append('category', data.category);
      formData.append('status', data.status);

      if (data.patient) {
        formData.append('patient', data.patient);
      }

      if (data.notes) {
        formData.append('notes', data.notes);
      }

      if (data.receipt_file) {
        formData.append('receipt_file', data.receipt_file);
      }

      if (currentUser?.id) {
        formData.append('created_by', currentUser.id);
      }

      return await getCollection<HSAReceipt>(Collections.HSA_RECEIPTS).create(formData);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('hsa').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('hsa').all(),
      });
      logger.info('HSA receipt created successfully');
    },
    onError: (error) => {
      logger.error('Failed to create HSA receipt', error);
    },
  });
}
