import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { setAccountLink } from '../utils/accountSync';

/** Link a person to an account, moving the account off anyone else. */
export function useLinkAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ personId, userId }: { personId: string; userId: string }) =>
      setAccountLink(personId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.app('people').all() });
    },
  });
}
