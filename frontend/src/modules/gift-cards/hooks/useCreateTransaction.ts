/**
 * Create Transaction Mutation Hook
 *
 * Records a balance change against a gift card and updates the parent card.
 * Routes through aepbase (transactions are a child of gift-cards, addressed
 * via the URL path) or PB (transactions are a top-level collection with a
 * `gift_card` foreign-key field) based on the gift-cards backend flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import {
  Collections,
  getCollection,
  getCurrentUser as getPbUser,
} from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import type { GiftCard, GiftCardTransaction, TransactionFormData } from '../types';
import { mapPbGiftCard, mapPbTransaction } from './_mapPbRecords';

interface CreateTransactionParams {
  giftCardId: string;
  currentAmount: number;
  data: TransactionFormData;
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

      if (isAepbaseEnabled('gift-cards')) {
        const aepUserId = aepbase.getCurrentUser()?.id;
        const transaction = await aepbase.create<GiftCardTransaction>(
          AepCollections.GIFT_CARD_TRANSACTIONS,
          {
            transaction_type: data.transaction_type,
            previous_amount: currentAmount,
            new_amount: newAmount,
            amount_changed: amountChanged,
            notes: data.notes,
            created_by: aepUserId ? `users/${aepUserId}` : undefined,
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
      }

      // PocketBase path.
      const pbUserId = getPbUser()?.id;
      const rawTx = await getCollection<Parameters<typeof mapPbTransaction>[0]>(
        Collections.GIFT_CARD_TRANSACTIONS,
      ).create({
        gift_card: giftCardId,
        transaction_type: data.transaction_type,
        previous_amount: currentAmount,
        new_amount: newAmount,
        amount_changed: amountChanged,
        notes: data.notes,
        created_by: pbUserId,
      });
      const transaction = mapPbTransaction(rawTx);

      if (newAmount === 0) {
        await getCollection(Collections.GIFT_CARDS).delete(giftCardId);
        return { transaction, updatedCard: null };
      }
      const rawCard = await getCollection<Parameters<typeof mapPbGiftCard>[0]>(
        Collections.GIFT_CARDS,
      ).update(giftCardId, { amount: newAmount });
      return { transaction, updatedCard: mapPbGiftCard(rawCard) };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('gift-cards').all(),
      });
    },
  });
}
