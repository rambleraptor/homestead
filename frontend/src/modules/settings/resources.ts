/**
 * aepbase resource definitions owned by the settings module.
 *
 * Source of truth — synced to aepbase by
 * `frontend/scripts/apply-schema.ts`. Equivalent to
 * `aepbase/terraform/users.tf`.
 *
 * The `module-flag` resource is built dynamically from declared module
 * flags; see `flags.ts` -> `buildModuleFlagsResourceDefinition`.
 */

import type { AepResourceDefinition } from '../../core/aep/types';

const userPreference: AepResourceDefinition = {
  singular: 'user-preference',
  plural: 'user-preferences',
  description:
    'Per-user app preferences. Currently holds map_provider; extend as new user-scoped settings appear.',
  user_settable_create: true,
  parents: ['user'],
  schema: {
    type: 'object',
    properties: {
      map_provider: {
        type: 'string',
        description: 'one of: google, apple',
      },
    },
  },
};

export const settingsResources: AepResourceDefinition[] = [userPreference];
