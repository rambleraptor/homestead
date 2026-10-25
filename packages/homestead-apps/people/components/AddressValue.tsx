/**
 * An address in an assistant reply (the `address` typed value): opens in the
 * map service the person picked in their People settings.
 */

import { MapPin } from 'lucide-react';
import type { ChatValueProps } from '@rambleraptor/homestead-core/apps/types';
import type { MapProvider } from '@rambleraptor/homestead-core/auth/types';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { ValueLink } from '@rambleraptor/homestead-core/chat/components/values/ValueLink';
import { getMapUrl } from '../utils/mapUtils';

const PROVIDER_NAMES: Record<MapProvider, string> = {
  google: 'Google Maps',
  apple: 'Apple Maps',
};

export default function AddressValue({ text }: ChatValueProps) {
  const { user } = useAuth();
  const provider: MapProvider = user?.map_provider || 'google';
  return (
    <ValueLink
      type="address"
      href={getMapUrl(text, provider)}
      text={text}
      icon={MapPin}
      external
      label={`Open in ${PROVIDER_NAMES[provider] ?? 'Maps'}`}
    />
  );
}
