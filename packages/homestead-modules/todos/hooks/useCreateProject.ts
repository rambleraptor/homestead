import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { Project } from '../types';

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string }): Promise<Project> => {
      const userId = aepbase.getCurrentUser()?.id;
      const createdBy = userId ? `users/${userId}` : undefined;
      return aepbase.create<Project>(AepCollections.PROJECTS, {
        name: data.name,
        ...(createdBy ? { created_by: createdBy } : {}),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.module('todos').all(),
      });
      await queryClient.refetchQueries({
        queryKey: queryKeys.module('todos').all(),
      });
    },
    onError: (error) => logger.error('Project create mutation error', error),
  });
}
