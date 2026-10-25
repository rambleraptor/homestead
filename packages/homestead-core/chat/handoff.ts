/**
 * A first message written somewhere else (the dashboard's ask box) for the
 * Chat screen to send as it opens.
 *
 * Held in memory rather than in router state: the files are data URLs, which
 * history state would have to serialize (and some browsers cap its size), and a
 * message taken once can't be sent again by a reload or the back button.
 */

import type { FileUIPart } from 'ai';

export interface HandedOffMessage {
  text: string;
  files: FileUIPart[];
}

let pending: HandedOffMessage | null = null;

/** Leave `message` for the Chat screen to send when it next opens a new chat. */
export function handOff(message: HandedOffMessage): void {
  pending = message;
}

/** The message left by {@link handOff}, at most once. */
export function takeHandOff(): HandedOffMessage | null {
  const message = pending;
  pending = null;
  return message;
}
