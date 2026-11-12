/**
 * Types for the Today widget.
 *
 * A `TodayItem` is one line on the card, whatever app it came from. Lanes
 * produce these; the widget only knows how to render them. That split is what
 * lets a new lane be added without touching the component.
 *
 * Lives under the Todos app, which owns the Today widget — see `useToday`.
 */

/**
 * How much of the viewer's attention a line is asking for. This — not the
 * source app — decides where a line sorts, because the point of the card is
 * "what needs me today", not "here is a summary of each app".
 *
 *   now     — happens today (or tonight): a birthday, bin night, a 2pm call.
 *   soon    — has a deadline close enough to act on: a perk about to expire.
 *   ambient — standing state with no deadline: the grocery list, open todos.
 */
export type TodayUrgency = 'now' | 'soon' | 'ambient';

/** Which producer a line came from. Used for keys, test assertions, and icons. */
export type TodayLane =
  | 'reminder'
  | 'event'
  | 'calendar'
  | 'pickup'
  | 'perk'
  | 'groceries'
  | 'todos';

export interface TodayItem {
  /** Stable across renders; unique within a render. Prefixed by lane. */
  id: string;
  lane: TodayLane;
  /** The headline. Written to read as a sentence fragment, not a label. */
  title: string;
  /** Optional second line: the supporting detail. */
  detail?: string;
  /** Where clicking the line goes — always the owning app. */
  href: string;
  urgency: TodayUrgency;
  /**
   * Epoch ms for time-bound lines, used to order within an urgency band.
   * Undefined for ambient state, which has no moment attached and sorts last.
   */
  at?: number;
}
