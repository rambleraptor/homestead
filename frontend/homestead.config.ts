/**
 * Homestead instance configuration.
 *
 * This is the ONE file you edit to choose what your homestead serves.
 * Comment out a module to remove it; import a new one to add it.
 *
 * The settings and superuser modules are always installed by the
 * registry — you don't list them here. They cover account management
 * and flag management, which the rest of the app depends on.
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
  ],
};

export default config;
