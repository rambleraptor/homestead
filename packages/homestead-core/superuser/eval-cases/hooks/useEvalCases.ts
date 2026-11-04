import {
  useResourceDelete,
  useResourceList,
  useResourceUpdate,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import { EVAL_CASES } from '../resources';
import type { EvalCase } from '../types';

const APP = 'eval-cases';

/** Every eval case, newest first. */
export function useEvalCases() {
  return useResourceList<EvalCase>(APP, 'eval-case', EVAL_CASES, { orderBy: '-create_time' });
}

export type EvalCaseReview = Pick<EvalCase, 'expected' | 'status'>;

export function useUpdateEvalCase() {
  return useResourceUpdate<EvalCase, EvalCaseReview>(APP, 'eval-case');
}

export function useDeleteEvalCase() {
  return useResourceDelete(APP, 'eval-case');
}
