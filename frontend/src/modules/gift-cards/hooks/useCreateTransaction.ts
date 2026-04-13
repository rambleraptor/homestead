/**
 * Create Transaction Mutation Hook
 *
 * Records a balance change against a gift card and updates the parent.
 * Transaction lives at /gift-cards/{id}/transactions/{tx_id}, so the parent
 * id is part of the URL rather than a foreign-key field.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import type { GiftCard, GiftCardTransaction, TransactionFormData } from '../types';

interface CreateTransactionParams {
  giftCardId: string;
  currentAmount: number;
  data: TransactionFormData;
}

function createdByPath(): string | undefined {
  const id = aepbase.getCurrentUser()?.id;
  return id ? `users/${id}` : undefined;
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ giftCardId, currentAmount, data }: CreateTransactionParams) => {
      let newAmount: number;
      let amountChanged: number;
      if (data.transaction_type === 'decrement') {
        newAmount = Math.max(0, currentAmount - data.amount);
        amountChanged = -(currentAmount - newAmount);
      } else {
        newAmount = data.amount;
        amountChanged = newAmount - currentAmount;
      }

      const transaction = await aepbase.create<GiftCardTransaction>(
        AepCollections.GIFT_CARD_TRANSACTIONS,
        {
          transaction_type: data.transaction_type,
          previous_amount: currentAmount,
          new_amount: newAmount,
          amount_changed: amountChanged,
          notes: data.notes,
          created_by: createdByPath(),
        },
        { parent: [AepCollections.GIFT_CARDS, giftCardId] },
      );

      if (newAmount === 0) {
        await aepbase.remove(AepCollections.GIFT_CARDS, giftCardId);
        return { transaction, updatedCard: null };
      }
      const updatedCard = await aepbase.update<GiftCard>(
        AepCollections.GIFT_CARDS,
        giftCardId,
        { amount: newAmount },
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
