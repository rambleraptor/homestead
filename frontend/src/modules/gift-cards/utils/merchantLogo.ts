/**
 * Merchant Logo Utilities
 *
 * Utilities for fetching and caching merchant logos using Clearbit Logo API
 */

/**
 * Extract domain from merchant name
 * Attempts to find a domain-like pattern or constructs one from the merchant name
 */
export function extractDomain(merchantName: string): string {
  const trimmed = merchantName.trim().toLowerCase();

  // Check if already a domain
  if (trimmed.includes('.com') || trimmed.includes('.net') || trimmed.includes('.org')) {
    return trimmed.split(/\s+/)[0];
  }

  // Remove common words and special characters
  const cleaned = trimmed
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\b/g, '')
    .trim()
    .replace(/\s+/g, '');

  // Construct domain
  return `${cleaned}.com`;
}

/**
 * Get logo URL from Clearbit
 * Returns the Clearbit logo URL for the given domain
 */
export function getClearbitLogoUrl(domain: string): string {
  return `https://logo.clearbit.com/${domain}`;
}

/**
 * Check if a logo URL is valid by attempting to load it
 */
export async function validateLogoUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch logo URL for a merchant
 * Attempts to get logo from Clearbit and validates it
 */
export async function fetchMerchantLogo(merchantName: string): Promise<string | null> {
  const domain = extractDomain(merchantName);
  const logoUrl = getClearbitLogoUrl(domain);

  const isValid = await validateLogoUrl(logoUrl);
  return isValid ? logoUrl : null;
}
