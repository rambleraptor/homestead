/**
 * Resolve a gift-card image field to a blob URL the browser can render.
 *
 * Browsers can't auth a plain `<img src>` at aepbase's `:download` POST
 * endpoint, so we fetch the bytes here, blob-URL them, and revoke the URL
 * on unmount / when the input changes.
 */

import { useEffect, useState } from 'react';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { GiftCard } from '../types';

type ImageField = 'front_image' | 'back_image';

export function useGiftCardImageUrl(
  card: GiftCard | null | undefined,
  field: ImageField,
): string | null {
  const cardId = card?.id;
  const filename = card?.[field];

  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!cardId || !filename) return;
    let cancelled = false;
    let createdUrl: string | null = null;

    aepbase
      .download(AepCollections.GIFT_CARDS, cardId, field)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        logger.error('Failed to download gift card image', error, { cardId, field });
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [cardId, filename, field]);

  return cardId && filename ? url : null;
}
