/**
 * Where the drop box keeps its boxes and the links waiting in them. Two
 * implementations: D1 for the deployed Worker (`./d1-store`) and memory for
 * tests and for Homestead's own specs (`./memory-store`), so both run the same
 * request handling.
 */

export interface PendingLink {
  /** Random and never reused: the collector derives its record id from it. */
  id: string;
  /** Order of arrival within the drop box; what a collection acknowledges through. */
  seq: number;
  url: string;
  /** When it arrived, as an ISO 8601 UTC timestamp. */
  received_at: string;
}

export interface Store {
  hasBox(box: string): Promise<boolean>;
  /** Register a box. Registering one that exists changes nothing. */
  putBox(box: string, now: number): Promise<void>;
  /** Remove a box and everything waiting in it. */
  deleteBox(box: string): Promise<void>;
  /** Links waiting in a box, oldest first, at most `limit`. */
  listLinks(box: string, limit: number): Promise<PendingLink[]>;
  countLinks(box: string): Promise<number>;
  addLink(box: string, link: { id: string; url: string }, now: number): Promise<void>;
  /** Forget a box's links up to and including `throughSeq`. */
  ackLinks(box: string, throughSeq: number): Promise<number>;
  /** Forget every link that arrived before `before`. */
  purgeBefore(before: number): Promise<number>;
}
