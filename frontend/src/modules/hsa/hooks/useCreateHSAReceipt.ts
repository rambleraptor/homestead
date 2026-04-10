/**
 * Create HSA Receipt — branches on the `hsa-receipts` flag.
 *
 * Both backends accept multipart/form-data with the same field names. Only
 * the `created_by` shape differs (PB: bare id, aepbase: `users/{id}`).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, Collections, getCurrentUser } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { HSAReceipt, HSAReceiptFormData } from '../types';

export function useCreateHSAReceipt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: HSAReceiptFormData) => {
      const useAep = isAepbaseEnabled('hsa-receipts');
      const formData = new FormData();
      formData.append('merchant', data.merchant);
      formData.append('service_date', data.service_date);
      formData.append('amount', data.amount.toString());
      formData.append('category', data.category);
      formData.append('status', data.status);
      if (data.patient) formData.append('patient', data.patient);
      if (data.notes) formData.append('notes', data.notes);
      if (data.receipt_file) formData.append('receipt_file', data.receipt_file);

      if (useAep) {
        const aepUserId = aepbase.getCurrentUser()?.id;
        if (aepUserId) formData.append('created_by', `users/${aepUserId}`);
        return await aepbase.create<HSAReceipt>(AepCollections.HSA_RECEIPTS, formData);
      }

      const pbUser = getCurrentUser();
      if (pbUser?.id) formData.append('created_by', pbUser.id);
      return await getCollection<HSAReceipt>(Collections.HSA_RECEIPTS).create(formData);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.module('hsa').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.module('hsa').all() });
      logger.info('HSA receipt created successfully');
    },
    onError: (error) => {
      logger.error('Failed to create HSA receipt', error);
    },
  });
}
