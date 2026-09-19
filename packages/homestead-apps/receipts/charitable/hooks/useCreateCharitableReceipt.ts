/**
 * Create a charitable receipt via multipart upload.
 *
 * Mirrors `useCreateHSAReceipt`, with one difference: the acknowledgment file
 * is optional here *and* there, but a donation captured by hand often arrives
 * before its letter does, so the multipart body may carry only the resource.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import { CHARITABLE_RECEIPTS } from '../resources';
import type { CharitableReceipt, CharitableReceiptFormData } from '../types';

export function useCreateCharitableReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CharitableReceiptFormData) => {
      const userId = aepbase.getCurrentUser()?.id;
      const resource: Record<string, unknown> = {
        organization: data.organization,
        donation_date: data.donation_date,
        gift_type: data.gift_type,
        status: data.status,
      };
      if (data.organization_ein) resource.organization_ein = data.organization_ein;
      if (typeof data.tax_year === 'number') resource.tax_year = data.tax_year;
      if (typeof data.amount === 'number') resource.amount = data.amount;
      if (typeof data.value_received === 'number') {
        resource.value_received = data.value_received;
      }
      if (data.description_of_property) {
        resource.description_of_property = data.description_of_property;
      }
      if (data.goods_or_services) resource.goods_or_services = data.goods_or_services;
      if (data.donor) resource.donor = data.donor;
      if (data.person) resource.person = data.person;
      if (data.notes) resource.notes = data.notes;
      if (userId) resource.created_by = `users/${userId}`;

      const formData = new FormData();
      formData.append('resource', JSON.stringify(resource));
      if (data.receipt_file) formData.append('receipt_file', data.receipt_file);

      return await aepbase.create<CharitableReceipt>(CHARITABLE_RECEIPTS, formData);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.app('receipts').all() });
      await queryClient.refetchQueries({ queryKey: queryKeys.app('receipts').all() });
      logger.info('Charitable receipt created successfully');
    },
  });
}
