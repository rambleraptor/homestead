import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';

export interface SecurityStatus {
  /** True when a master key is configured and new writes are encrypted. */
  encryptionEnabled: boolean;
}

/**
 * Fetch the instance's encryption-at-rest status from the superuser-only
 * `/api/security/status` route. The page is already superuser-gated, so the
 * caller's token has the access this needs.
 */
export function useSecurityStatus() {
  return useQuery({
    queryKey: ['homestead-information', 'security-status'],
    queryFn: async (): Promise<SecurityStatus> => {
      const res = await aepbase.authorizedFetch('/api/security/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return (await res.json()) as SecurityStatus;
    },
  });
}
