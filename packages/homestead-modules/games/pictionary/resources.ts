import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const pictionaryResources: ResourceDefinition[] = [
  {
    singular: 'pictionary-game',
    plural: 'pictionary-games',
    description: 'A single Pictionary game session.',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        played_at: {
          type: 'string',
          description: 'RFC3339 timestamp of the game',
        },
        location: { type: 'string' },
        winning_word: {
          type: 'string',
          description: 'The clue/word the winning team guessed',
        },
        notes: { type: 'string' },
        created_by: { type: 'string', description: 'users/{user_id}' },
      },
      required: ['played_at'],
    },
  },
  {
    singular: 'pictionary-team',
    plural: 'pictionary-teams',
    description: 'A team within a Pictionary game.',
    user_settable_create: true,
    parents: ['pictionary-game'],
    schema: {
      type: 'object',
      properties: {
        players: {
          type: 'array',
          items: { type: 'string' },
          description: 'Player resource paths (people/{id})',
        },
        won: { type: 'boolean' },
        rank: {
          type: 'number',
          description:
            '1-based position within the game; teams have no name',
        },
        created_by: { type: 'string' },
      },
      required: ['players'],
    },
  },
];
