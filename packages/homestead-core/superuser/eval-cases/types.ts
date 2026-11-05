import type { ReplyRating } from '@rambleraptor/homestead-core/chat/types';
import type { TranscriptEntry } from '@rambleraptor/homestead-core/server/chat/eval-capture';
import type { EVAL_CASE_STATUSES } from './resources';

export type EvalCaseStatus = (typeof EVAL_CASE_STATUSES)[number];

/** An `eval-case` record: a rated reply and the conversation that led to it. */
export interface EvalCase {
  id: string;
  path: string;
  rating: ReplyRating;
  note?: string;
  rated_by?: string;
  conversation?: string;
  message?: string;
  title?: string;
  transcript?: TranscriptEntry[];
  context?: Record<string, unknown>;
  truncated?: boolean;
  expected?: string;
  status?: EvalCaseStatus;
  create_time: string;
  update_time: string;
}
