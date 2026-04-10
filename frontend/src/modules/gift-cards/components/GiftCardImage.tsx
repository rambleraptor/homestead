/**
 * Renders a gift-card image (front or back) in either PocketBase or aepbase
 * mode. Returns null while the aepbase blob is loading and on download
 * failure, mirroring the previous behavior of "no image" when files are
 * missing.
 */

import type { GiftCard } from '../types';
import { useGiftCardImageUrl } from '../hooks/useGiftCardImageUrl';

interface GiftCardImageProps {
  card: GiftCard;
  field: 'front_image' | 'back_image';
  alt: string;
  className?: string;
}

export function GiftCardImage({ card, field, alt, className }: GiftCardImageProps) {
  const url = useGiftCardImageUrl(card, field);
  if (!url) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
