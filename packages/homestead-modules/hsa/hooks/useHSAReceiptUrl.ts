/**
 * Resolve an HSA receipt's `receipt_file` to a blob URL the browser can render.
 */

import { useEffect, useState } from 'react';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { logger } from '@/core/utils/logger';
import type { HSAReceipt } from '../types';

export function useHSAReceiptUrl(receipt: HSAReceipt | null | undefined): string | null {
  const id = receipt?.id;
  const filename = receipt?.receipt_file;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !filename) return;
    let cancelled = false;
    let createdUrl: string | null = null;

    aepbase
      .download(AepCollections.HSA_RECEIPTS, id, 'receipt_file')
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      })
      .catch((error) => {
        if (cancelled) return;
        logger.error('Failed to download HSA receipt file', error, { id });
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [id, filename]);

  return id && filename ? url : null;
}
