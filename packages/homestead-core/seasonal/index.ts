/**
 * Seasonal flavour: the day's holiday on the document (`useSeasonalTheme`,
 * mounted in the shell) and its accent overrides (`seasonal.css`, imported
 * from the SPA's globals.css). The holiday table itself lives with the date
 * helpers (`shared/utils/dateUtils.ts`), where the greeting and the chat
 * starters already read it.
 */

export { applySeasonalTheme, emojiFaviconHref, msUntilMidnight, useSeasonalTheme } from './theme';
