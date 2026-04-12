/**
 * Resolve a gift-card image field to a URL the browser can render.
 *
 * Branches on `isAepbaseEnabled('gift-cards')`:
 *
 *  - PocketBase mode: the field holds a filename. `pb.files.getURL` builds a
 *    same-origin URL synchronously, so we return it immediately.
 *  - aepbase mode: the field holds a download URL but only the POST form of
 *    `:download` works (browsers can't auth a plain `<img src>`). We POST,
 *    receive the bytes, blob-URL them, and return the object URL. The
 *    object URL is revoked on unmount and when the input changes so we
 *    don't leak.
 */

import { useEffect, useState } from 'react';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { pb } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import type { GiftCard } from '../types';

type ImageField = 'front_image' | 'back_image';

export function useGiftCardImageUrl(
  card: GiftCard | null | undefined,
  field: ImageField,
): string | null {
  const cardId = card?.id;
  const filename = card?.[field];
  const useAep = isAepbaseEnabled('gift-cards');

  // Synchronous PB result, used as the initial value when in PB mode so the
  // image renders on first paint without a flash.
  const pbUrl =
    !useAep && card && filename ? pb.files.getURL(card, filename) : null;

  // aepUrl is only meaningful in aepbase mode. We never reset it
  // synchronously inside the effect (that triggers React's "setState in
  // effect" lint rule) — the gating happens at the return statement, and the
  // cleanup callback below revokes the previous blob URL when deps change.
  const [aepUrl, setAepUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!useAep || !cardId || !filename) {
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;

    aepbase
      .download(AepCollections.GIFT_CARDS, cardId, field)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setAepUrl(createdUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        logger.error('Failed to download gift card image', error, {
          cardId,
          field,
        });
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [useAep, cardId, filename, field]);

  if (useAep) {
    return cardId && filename ? aepUrl : null;
  }
  return pbUrl;
}
