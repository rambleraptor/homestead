/**
 * Homestead instance configuration.
 *
 * This is the ONE file you edit to choose what your homestead serves.
 * Comment out a module to remove it; import a new one to add it.
 *
 * `settingsModule` and `superuserModule` are part of the core experience
 * and should normally be left in place.
 */

import {
  creditCardsModule,
  dashboardModule,
  gamesModule,
  giftCardsModule,
  groceriesModule,
  hsaModule,
  notificationsModule,
  peopleModule,
  recipesModule,
  todosModule,
} from '@rambleraptor/homestead-modules';
import { settingsModule } from '@/modules/settings/module.config';
import { superuserModule } from '@/modules/superuser/module.config';
import type { HomesteadConfig } from '@/modules/config';

const config: HomesteadConfig = {
  modules: [
    dashboardModule,
    todosModule,
    giftCardsModule,
    groceriesModule,
    recipesModule,
    peopleModule,
    hsaModule,
    creditCardsModule,
    gamesModule,
    notificationsModule,
    superuserModule,
    settingsModule,
  ],
};

export default config;
