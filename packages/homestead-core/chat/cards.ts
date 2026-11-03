/**
 * Which card renders a tool call in a reply (see `components/ChatCard.tsx`).
 *
 * A tool part names its resource (`tool-gift_cards`) and carries the action
 * in its input; this module reads those back to the resource's definition and
 * owning app, and picks the card: the app's `chat.cards` entry that claims the
 * action, else the generic card (which wraps the app's `records` card when
 * there is one). Runtime-free apart from the registry, so the pieces that
 * shape a card (mode, outcome, rows) can be tested without React.
 */

import type { ToolUIPart } from 'ai';
import type { ChatCardAction, ChatCardProps, ChatCardType } from '../apps/types';
import type { FieldDef, ResourceDefinition } from '../resources/types';
import { ownerOfTool, recordCardOf, type RecordOwner } from '../records/owners';
import { toolNameOf } from './tool-names';

/** The app and definition behind a tool call (see `records/owners`). */
export type CardOwner = RecordOwner;

const CRUD_ACTIONS: ReadonlySet<string> = new Set(['create', 'read', 'update', 'delete', 'list']);

/**
 * The action a tool call's input names, or null when it isn't a resource
 * action. The tool calls a single read `get`; the card contract names it
 * `read`, after the CRUD op it is.
 */
export function cardActionOf(input: unknown): ChatCardAction | null {
  const action = (input as { action?: unknown } | null)?.action;
  if (typeof action !== 'string') return null;
  if (action === 'get') return 'read';
  if (CRUD_ACTIONS.has(action)) return action as ChatCardAction;
  return /^:[a-z][a-z0-9-]*$/.test(action) ? (action as ChatCardAction) : null;
}

/** The resource and app behind a tool part's type; undefined for MCP, search, or an unknown tool. */
export function ownerForTool(partType: string): CardOwner | undefined {
  const name = toolNameOf(partType);
  return name ? ownerOfTool(name) : undefined;
}

/** The app's chat card for this action, if it declares one that claims it. */
export function chatCardFor(owner: CardOwner, action: ChatCardAction): ChatCardType | undefined {
  const cards = owner.app.chat?.cards;
  if (!cards) return undefined;
  const key = action.startsWith(':') ? `${owner.def.singular}${action}` : owner.def.singular;
  const card = cards[key];
  if (!card) return undefined;
  return !card.actions || card.actions.includes(action) ? card : undefined;
}

/** The app's record card for the resource, if it declares one. */
export const recordCardFor = recordCardOf;

/** What the tool's output says: the executor's `{ result }` or `{ error }`. */
export function toolOutcome(part: Pick<ToolUIPart, 'state' | 'output' | 'errorText'>): {
  result?: unknown;
  error?: string;
} {
  if (part.state === 'output-error') return { error: part.errorText || 'The call failed.' };
  if (part.state !== 'output-available') return {};
  const output = part.output as { result?: unknown; error?: unknown } | null | undefined;
  if (output && typeof output === 'object') {
    if (typeof output.error === 'string') return { error: output.error };
    if ('result' in output) return { result: output.result };
  }
  return { result: output };
}

/** The card's mode for a tool part's state (a failed call is `output-available` with `{ error }`). */
export function cardMode(part: Pick<ToolUIPart, 'state' | 'output' | 'errorText'>): ChatCardProps['mode'] {
  switch (part.state) {
    case 'approval-requested':
      return 'proposed';
    case 'output-denied':
      return 'denied';
    case 'output-error':
      return 'failed';
    case 'output-available':
      return toolOutcome(part).error === undefined ? 'done' : 'failed';
    default:
      return 'running';
  }
}

/** The record id a call names: the one it read/changed, or the one it made. */
export function cardRecordId(input: Record<string, unknown>, result: unknown): string | undefined {
  const fromResult = (result as { id?: unknown } | null)?.id;
  if (typeof fromResult === 'string' && fromResult) return fromResult;
  return typeof input.id === 'string' && input.id ? input.id : undefined;
}

/** The records a `list` returned, when the output is still a page and not a preview. */
export function listedRecords(result: unknown): unknown[] | undefined {
  const records = (result as { records?: unknown } | null)?.records;
  return Array.isArray(records) ? records : undefined;
}

export interface CardRow {
  /** The field's label: its display name, else the humanized field name. */
  label: string;
  value: string;
}

/** `annual_fee` → `Annual fee`; an enum value `do_later` → `Do later`. */
export function humanizeName(name: string): string {
  const words = name.split(/[_-]/).filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A row's value is cut here: a pasted document belongs behind Details, not on the card. */
const ROW_VALUE_MAX = 160;

/** A scalar as a row reads it; undefined for anything a row can't show. */
function rowValue(field: FieldDef | undefined, value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  if (field?.enum?.includes(value)) return humanizeName(value);
  if (field?.format === 'date-time') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
  return value.length > ROW_VALUE_MAX ? `${value.slice(0, ROW_VALUE_MAX).trimEnd()}…` : value;
}

/**
 * The rows a card shows for a body (`fields` on a create or update, a method's
 * `body`, or a record): the scalar fields people would read, labeled. Skipped:
 * the title (shown above), reference ids (meaningless as text), encrypted and
 * secret fields (never shown unasked), and server-managed timestamps.
 */
export function cardRows(def: ResourceDefinition, body: unknown, omit: readonly string[] = []): CardRow[] {
  if (!body || typeof body !== 'object') return [];
  const rows: CardRow[] = [];
  for (const [name, raw] of Object.entries(body as Record<string, unknown>)) {
    if (omit.includes(name) || name === 'id' || name === 'create_time' || name === 'update_time') continue;
    if (name === 'path' || name === 'created_by') continue;
    const field = def.fields[name];
    if (field?.reference || field?.encrypted || field?.secret || field?.deprecated) continue;
    if (field?.type === 'file') continue;
    const value = rowValue(field, raw);
    if (value === undefined) continue;
    rows.push({ label: field?.singular_name ?? humanizeName(name), value });
  }
  return rows;
}
