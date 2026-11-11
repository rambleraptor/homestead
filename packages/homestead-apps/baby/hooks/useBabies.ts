import {
  useResourceCreate,
  useResourceList,
  useResourceUpdate,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import { BABIES } from '../resources';
import type { Baby, BabyFormData } from '../types';

/** The household's babies, first added first. */
export function useBabies() {
  return useResourceList<Baby>('baby', 'baby', BABIES, { orderBy: 'create_time' });
}

export function useCreateBaby() {
  return useResourceCreate<Baby, BabyFormData>('baby', 'baby');
}

export function useUpdateBaby() {
  return useResourceUpdate<Baby, Partial<BabyFormData>>('baby', 'baby');
}
