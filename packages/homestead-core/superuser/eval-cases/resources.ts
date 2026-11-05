import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const EVAL_CASES = 'eval-cases' as const;

export const EVAL_CASE_STATUSES = ['new', 'ready', 'retired'] as const;

/**
 * A rated assistant reply, filed as a test case for the assistant: the
 * conversation up to and including that reply, copied out of the conversation
 * when the person rated it (`chat-messages/{id}:rate`), so it outlives the
 * conversation's retention and its deletion. Clearing the rating withdraws it.
 *
 * Written by the server (a system token) on the rater's behalf; superusers read
 * and review it — `expected` is what the reply should have done, `status` moves
 * it from `new` to `ready` (in the eval suite) or `retired`. Out of the model
 * tools: the assistant never reads its own grades.
 */
export const evalCaseResources: ResourceDefinition[] = [
  {
    singular: 'eval-case',
    plural: EVAL_CASES,
    description:
      'An assistant reply someone rated, with the conversation that led to it, kept as a test case.',
    superuser_write: true,
    access: { model: 'superusers' },
    modelTools: { chat: false, mcp: false },
    fields: {
      rating: { type: 'string', enum: ['up', 'down'], required: true },
      note: {
        type: 'string',
        maxLength: 1000,
        description: 'What the person said it should have done.',
      },
      rated_by: { type: 'string', reference: { resource: 'user' } },
      conversation: {
        type: 'string',
        reference: { resource: 'conversation', onDelete: 'set-null' },
        description: 'The conversation it was copied from, while it exists.',
      },
      message: {
        type: 'string',
        description: 'The rated reply’s path (conversations/{id}/chat-messages/{id}).',
      },
      title: { type: 'string', description: 'The conversation’s title when rated.' },
      transcript: {
        type: 'array',
        items: { type: 'object' },
        description:
          'The messages up to and including the rated reply: role, text, and the AI SDK parts ' +
          '(tool calls with their stored outputs), encrypted values masked.',
      },
      context: {
        type: 'object',
        description:
          'What the turn ran with, as of the rating: model, timezone, the reply’s time, the ' +
          'household and app context the prompt would carry.',
      },
      truncated: {
        type: 'boolean',
        description: 'Some tool output was stored shortened, so a replay can’t return all of it.',
      },
      expected: {
        type: 'string',
        maxLength: 4000,
        description: 'What the reply should have done, written by a reviewer.',
      },
      status: { type: 'string', enum: [...EVAL_CASE_STATUSES], default: 'new' },
    },
  },
];
