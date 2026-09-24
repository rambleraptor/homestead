/**
 * @rambleraptor/homestead-apps
 *
 * Aggregate barrel of every feature app that ships in this package.
 * Built-in apps — settings, superuser, dashboard, notifications, chat, the
 * registry itself, and the app-contract types — live in homestead-core (the
 * dashboard and notifications are always installed); they are part of the core
 * experience, not feature content.
 */

export { creditCardsApp } from './credit-cards';
export { documentsApp } from './documents';
export { eventsApp } from './events';
export { gamesApp } from './games';
export { giftCardsApp } from './gift-cards';
export { groceriesApp } from './groceries';
export { healthApp } from './health';
export { homeApp } from './home';
export { peopleApp } from './people';
export { receiptsApp } from './receipts';
export { recipesApp } from './recipes';
export { todosApp } from './todos';
