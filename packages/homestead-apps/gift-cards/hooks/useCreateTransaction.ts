/**
 * Create Transaction Mutation Hook
 *
 * Records a balance change against a gift card and updates the parent.
 * Transaction lives at /gift-cards/{id}/transactions/{tx_id}, so the parent
 * id is part of the URL rather than a foreign-key field.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { GIFT_CARDS, GIFT_CARD_TRANSACTIONS } from '../resources';
import type { GiftCard, GiftCardTransaction, TransactionFormData } from '../types';

interface CreateTransactionParams {
  giftCardId: string;
  /** The card's merchant, named in the "used up" celebration. */
  merchant: string;
  currentAmount: number;
  data: TransactionFormData;
}

function createdByPath(): string | undefined {
  const id = aepbase.getCurrentUser()?.id;
  return id ? `users/${id}` : undefined;
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  const toast = useToast();

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
        GIFT_CARD_TRANSACTIONS,
        {
          transaction_type: data.transaction_type,
          previous_amount: currentAmount,
          new_amount: newAmount,
          amount_changed: amountChanged,
          notes: data.notes,
          created_by: createdByPath(),
        },
        { parent: [GIFT_CARDS, giftCardId] },
      );

      if (newAmount === 0) {
        // The card has transaction children; force-cascade the delete.
        await aepbase.remove(GIFT_CARDS, giftCardId, { force: true });
        return { transaction, updatedCard: null };
      }
      const updatedCard = await aepbase.update<GiftCard>(
        GIFT_CARDS,
        giftCardId,
        { amount: newAmount },
      );
      return { transaction, updatedCard };
    },
    onSuccess: ({ updatedCard }, { merchant }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.app('gift-cards').all(),
      });
      // Spending the last of a card is a small win: say so, once, in the tab
      // that did it. A card at zero was removed above, so `updatedCard` is
      // null exactly when this transaction used it up.
      if (updatedCard === null) {
        toast.celebrate('Used up!', { description: `${merchant} card fully spent` });
      }
    },
  });
}
