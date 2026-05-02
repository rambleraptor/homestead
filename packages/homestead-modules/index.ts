/**
 * @rambleraptor/homestead-modules
 *
 * Aggregate barrel of every feature module that ships in this package.
 * Settings, superuser, the registry itself, and the module-contract types
 * remain in the frontend tree (see `frontend/src/modules/`) — they are part
 * of the core experience, not feature content.
 */

export { creditCardsModule } from './credit-cards';
export { dashboardModule } from './dashboard';
export { gamesModule } from './games';
export { giftCardsModule } from './gift-cards';
export { groceriesModule } from './groceries';
export { hsaModule } from './hsa';
export { notificationsModule } from './notifications';
export { peopleModule } from './people';
export { recipesModule } from './recipes';
export { todosModule } from './todos';
