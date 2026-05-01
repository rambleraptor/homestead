/**
 * Aggregator for every aepbase resource definition the app owns.
 *
 * Each module exposes its own `resources.ts`; this file just stitches
 * them together. Kept React-free so it can be loaded from a Node CLI
 * (`frontend/scripts/apply-schema.ts`) and the Playwright e2e
 * bootstrap (`tests/e2e/config/apply-schema.ts`) without dragging in
 * the rest of the app.
 *
 * `module-flag` is intentionally NOT in this list — it's built
 * dynamically from declared module flags. Compose it via
 * `buildModuleFlagsResourceDefinition(getAllModuleFlagDefs())` from
 * `@/modules/settings/flags` + `@/modules/registry` at the call site.
 */

import type { AepResourceDefinition } from './types';

import { creditCardsResources } from '../../modules/credit-cards/resources';
import { minigolfResources } from '../../modules/games/minigolf/resources';
import { pictionaryResources } from '../../modules/games/pictionary/resources';
import { giftCardsResources } from '../../modules/gift-cards/resources';
import { groceriesResources } from '../../modules/groceries/resources';
import { hsaResources } from '../../modules/hsa/resources';
import { notificationsResources } from '../../modules/notifications/resources';
import { peopleResources } from '../../modules/people/resources';
import { recipesResources } from '../../modules/recipes/resources';
import { settingsResources } from '../../modules/settings/resources';
import { todosResources } from '../../modules/todos/resources';

export const ALL_DOMAIN_RESOURCES: readonly AepResourceDefinition[] = [
  ...creditCardsResources,
  ...giftCardsResources,
  ...groceriesResources,
  ...hsaResources,
  ...minigolfResources,
  ...notificationsResources,
  ...peopleResources,
  ...pictionaryResources,
  ...recipesResources,
  ...settingsResources,
  ...todosResources,
];
