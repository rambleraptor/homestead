import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

/** Collection plural — the URL segment under `/users/{id}/`. */
export const NOTES = 'notes' as const;

export const notesResources: ResourceDefinition[] = [
  {
    singular: 'note',
    plural: NOTES,
    // Under the user root, so the engine keeps every note private to the
    // person who wrote it (and superusers). There is no sharing.
    parents: ['user'],
    description:
      'A quick, free-form note — like a line jotted on paper. Private to the person who wrote it. ' +
      'There is no title: the first line reads as one. Words starting with # in the body are tags.',
    user_settable_create: true,
    fields: {
      body: { type: 'string', required: true, description: 'The note text. #words are tags.' },
      struck: {
        type: 'boolean',
        description: 'Crossed out: kept in the list, but shown struck through.',
      },
    },
  },
];
