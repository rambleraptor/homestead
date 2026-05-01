/**
 * aepbase resource definitions for the minigolf game module.
 *
 * Source of truth — synced to aepbase by
 * `frontend/scripts/apply-schema.ts`. Equivalent to
 * `aepbase/terraform/minigolf.tf`.
 */

import type { AepResourceDefinition } from '../../../core/aep/types';

const game: AepResourceDefinition = {
  singular: 'game',
  plural: 'games',
  description: 'A mini golf game session.',
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: {
      location: { type: 'string' },
      played_at: { type: 'string', description: 'RFC3339 timestamp' },
      players: {
        type: 'array',
        items: { type: 'string' },
        description: 'Player resource paths (people/{id})',
      },
      hole_count: { type: 'number' },
      completed: { type: 'boolean' },
      notes: { type: 'string' },
      created_by: { type: 'string', description: 'users/{user_id}' },
    },
    required: ['players', 'hole_count'],
  },
};

const hole: AepResourceDefinition = {
  singular: 'hole',
  plural: 'holes',
  description: 'A single hole within a mini golf game.',
  user_settable_create: true,
  parents: ['game'],
  schema: {
    type: 'object',
    properties: {
      hole_number: { type: 'number' },
      par: { type: 'number' },
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            player: {
              type: 'string',
              description: 'people/{id} resource path',
            },
            strokes: { type: 'number' },
          },
        },
      },
      created_by: { type: 'string' },
    },
    required: ['hole_number', 'par', 'scores'],
  },
};

export const minigolfResources: AepResourceDefinition[] = [game, hole];
