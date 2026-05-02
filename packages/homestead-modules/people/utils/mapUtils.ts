import type { MapProvider } from '@rambleraptor/homestead-core/auth/types';

/**
 * Generate a map URL based on the provider and address
 */
export function getMapUrl(address: string, provider: MapProvider = 'google'): string {
  if (!address) return '';

  const encodedAddress = encodeURIComponent(address);

  if (provider === 'apple') {
    // Apple Maps URL format
    return `https://maps.apple.com/?q=${encodedAddress}`;
  }

  // Google Maps URL format (default)
  return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
}
