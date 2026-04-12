/**
 * Resolve an HSA receipt's `receipt_file` to a URL the browser can render.
 *
 * Same pattern as `useGiftCardImageUrl`: PB returns a synchronous URL, while
 * aepbase requires POST `:download` to fetch the bytes which we blob-URL and
 * revoke on unmount.
 */

import { useEffect, useState } from 'react';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { pb } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { logger } from '@/core/utils/logger';
import type { HSAReceipt } from '../types';

export function useHSAReceiptUrl(receipt: HSAReceipt | null | undefined): string | null {
  const id = receipt?.id;
  const filename = receipt?.receipt_file;
  const useAep = isAepbaseEnabled('hsa-receipts');

  const pbUrl = !useAep && receipt && filename ? pb.files.getURL(receipt, filename) : null;

  const [aepUrl, setAepUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!useAep || !id || !filename) return;
    let cancelled = false;
    let createdUrl: string | null = null;

    aepbase
      .download(AepCollections.HSA_RECEIPTS, id, 'receipt_file')
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setAepUrl(createdUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        logger.error('Failed to download HSA receipt file', error, { id });
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [useAep, id, filename]);

  if (useAep) return id && filename ? aepUrl : null;
  return pbUrl;
}
