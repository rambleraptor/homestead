/**
 * Create Transaction Mutation Hook
 *
 * Creates a transaction for a gift card and updates the card balance
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection, getCurrentUser } from '@/core/api/pocketbase';
import type { GiftCard, GiftCardTransaction, TransactionFormData } from '../types';

interface CreateTransactionParams {
  giftCardId: string;
  currentAmount: number;
  data: TransactionFormData;
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ giftCardId, currentAmount, data }: CreateTransactionParams) => {
      // Calculate the new amount based on transaction type
      let newAmount: number;
      let amountChanged: number;

      if (data.transaction_type === 'decrement') {
        newAmount = Math.max(0, currentAmount - data.amount);
        amountChanged = -(currentAmount - newAmount);
      } else {
        // transaction_type === 'set'
        newAmount = data.amount;
        amountChanged = newAmount - currentAmount;
      }

      // Create the transaction record
      const currentUser = getCurrentUser();
      const transaction = await getCollection<GiftCardTransaction>(
        Collections.GIFT_CARD_TRANSACTIONS
      ).create({
        gift_card: giftCardId,
        transaction_type: data.transaction_type,
        previous_amount: currentAmount,
        new_amount: newAmount,
        amount_changed: amountChanged,
        notes: data.notes,
        created_by: currentUser?.id,
      });

      // Delete the gift card if new amount is 0, otherwise update it
      if (newAmount === 0) {
        await getCollection(Collections.GIFT_CARDS).delete(giftCardId);
        return { transaction, updatedCard: null };
      }

      // Update the gift card with new amount
      const updatedCard = await getCollection<GiftCard>(Collections.GIFT_CARDS).update(
        giftCardId,
        {
          amount: newAmount,
        }
      );

      return { transaction, updatedCard };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('gift-cards').all(),
      });
    },
  });
}
