/**
 * Create Perk Mutation Hook.
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import { currentUserPath, useAepCreate } from '@/core/api/resourceHooks';
import type { CreditCardPerk, PerkFormData } from '../types';

export function useCreatePerk() {
  return useAepCreate<CreditCardPerk, PerkFormData>(
    AepCollections.CREDIT_CARD_PERKS,
    {
      moduleId: 'credit-cards',
      // Parent (`credit_card`) lives on the form data, so we drop into a
      // custom mutationFn rather than the static `parent` option.
      mutationFn: async (data) => {
        const { credit_card, ...body } = data;
        const created = await aepbase.create<CreditCardPerk>(
          AepCollections.CREDIT_CARD_PERKS,
          { ...body, created_by: currentUserPath() },
          { parent: [AepCollections.CREDIT_CARDS, credit_card] },
        );
        return { ...created, credit_card };
      },
    },
  );
}
