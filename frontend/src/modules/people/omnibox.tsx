'use client';

/**
 * People module — omnibox adapter.
 *
 * Declarative; no inline logic. The shared omnibox infra renders the list
 * component and the create form, and wires submit to `useCreatePerson`.
 */

import React from 'react';
import { z } from 'zod';
import type { OmniboxAdapter } from '@/shared/omnibox/types';
import type { PersonFormData } from './types';
import { PeopleList } from './components/PeopleList';
import { PersonForm } from './components/PersonForm';
import { useCreatePerson } from './hooks/useCreatePerson';

// The LLM only needs to prefill the obvious fields. The real form still
// collects the rest and lets the user edit what was parsed.
const createPersonParamSchema = z.object({
  name: z.string().optional(),
  birthday: z.string().optional(),
  anniversary: z.string().optional(),
});

export const peopleOmnibox: OmniboxAdapter = {
  synonyms: [
    'people',
    'person',
    'contacts',
    'contact',
    'family',
    'friends',
    'birthday',
    'birthdays',
    'anniversary',
    'anniversaries',
  ],
  filters: [
    {
      key: 'name',
      label: 'Name',
      type: 'text',
      description:
        "A substring of the person's name. Used by the People list's name filter.",
    },
  ],
  listComponent: PeopleList,
  forms: [
    {
      id: 'create-person',
      label: 'Create person',
      description: 'Add a new person to the address book.',
      paramSchema: createPersonParamSchema,
      useMutation: () => {
        const m = useCreatePerson();
        return {
          mutateAsync: (values) =>
            m.mutateAsync(values as unknown as PersonFormData),
          isPending: m.isPending,
        };
      },
      render: ({ initialValues, onSubmit, onCancel, isSubmitting }) => {
        const prefill = initialValues as Partial<PersonFormData>;
        // PersonForm expects a `Person` in `initialData`, so we synthesize
        // one just for the fields the form reads. The form fills in
        // defaults for everything else.
        const initialData = prefill.name
          ? ({
              id: '',
              name: prefill.name,
              addresses: [],
              birthday: prefill.birthday,
              anniversary: prefill.anniversary,
              notification_preferences: [],
              created_by: '',
              created: '',
              updated: '',
            } as unknown as Parameters<typeof PersonForm>[0]['initialData'])
          : undefined;
        return (
          <PersonForm
            initialData={initialData}
            onSubmit={(data) => onSubmit(data as unknown as Record<string, unknown>)}
            onCancel={onCancel}
            isSubmitting={isSubmitting}
          />
        );
      },
      successMessage: (values) => {
        const name = typeof values.name === 'string' ? values.name : 'person';
        return `Created ${name}`;
      },
    },
  ],
};
