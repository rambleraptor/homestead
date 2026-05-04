import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import type { Project } from '../types';

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.module('todos').list({ type: 'projects' }),
    queryFn: async (): Promise<Project[]> => {
      const projects = await aepbase.list<Project>(AepCollections.PROJECTS);
      return projects.sort((a, b) =>
        (a.create_time || '').localeCompare(b.create_time || ''),
      );
    },
  });
}
