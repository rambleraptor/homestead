/**
 * What the assistant's screens say with no connection. The assistant itself
 * can't work offline (a turn runs on the server), so they say that plainly
 * and point at what still does.
 */

/** In place of a new conversation's invitation. */
export const OFFLINE_EMPTY_DESCRIPTION =
  "You're offline, and the assistant needs a connection. Your apps still work, and what you change syncs when you reconnect.";

/** The composer's placeholder while it waits. */
export const OFFLINE_PLACEHOLDER = 'Offline: the assistant needs a connection';

/** The toast when a message couldn't reach the server; the composer keeps its text. */
export const OFFLINE_SEND_MESSAGE =
  "You're offline, so that wasn't sent. Your message is still in the box.";
