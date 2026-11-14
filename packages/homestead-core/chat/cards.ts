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
  previous?: Record<string, unknown>;
} {
  if (part.state === 'output-error') return { error: part.errorText || 'The call failed.' };
  if (part.state !== 'output-available') return {};
  const output = part.output as { result?: unknown; error?: unknown; previous?: unknown } | null | undefined;
  if (output && typeof output === 'object') {
    if (typeof output.error === 'string') return { error: output.error };
    if ('result' in output) {
      const previous = isPlainObject(output.previous) ? output.previous : undefined;
      return previous ? { result: output.result, previous } : { result: output.result };
    }
  }
  return { result: output };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * How a finished call can be put back, or null when it can't:
 *
 * - `update`: write each changed field's earlier value back. Only when the
 *   call changed nothing the executor couldn't record (a file, a secret), and
 *   only while the record still holds what the call set — so an undo never
 *   writes over a later change. `set` is what to compare against.
 * - `restore`: create a deleted record again under its old id. Only for a
 *   top-level resource that takes a chosen id, has no child resources (they
 *   went with it), no secret fields, and held no files (neither can be
 *   written back from the reply).
 */
export type UndoPlan =
  | { kind: 'update'; id: string; previous: Record<string, unknown>; set: Record<string, unknown> }
  | { kind: 'restore'; id: string; body: Record<string, unknown> };

export function undoPlan(
  props: Pick<ChatCardProps, 'resource' | 'action' | 'mode' | 'input' | 'result' | 'previous'>,
  hasChildren: boolean,
): UndoPlan | null {
  const { resource: def, action, mode, input, result, previous } = props;
  if (mode !== 'done' || !previous) return null;

  if (action === 'update') {
    const id = cardRecordId(input, result);
    const fields = isPlainObject(input.fields) ? input.fields : {};
    const changed = Object.keys(previous);
    if (!id || changed.length === 0 || !isPlainObject(result) || result.id !== id) return null;
    // A schema field the call wrote that `previous` doesn't cover is one the
    // executor couldn't record, so it can't be put back.
    const uncovered = Object.keys(fields).some((name) => name in def.fields && !(name in previous));
    if (uncovered) return null;
    const set = Object.fromEntries(changed.map((name) => [name, result[name] ?? null]));
    return { kind: 'update', id, previous, set };
  }

  if (action === 'delete') {
    const id = typeof previous.id === 'string' ? previous.id : undefined;
    if (!id || def.parents?.length || !def.user_settable_create || hasChildren) return null;
    // A secret never reaches the reply, so a record restored without it would
    // quietly lose it.
    if (Object.values(def.fields).some((field) => field.secret)) return null;
    const body: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(def.fields)) {
      const value = previous[name];
      if (value === undefined || value === null) continue;
      if (field.type === 'file') return null;
      body[name] = value;
    }
    return { kind: 'restore', id, body };
  }
  return null;
}

/** A field's value for comparing: empty (absent, null, '') all read the same. */
const comparable = (value: unknown): string =>
  value === undefined || value === null || value === '' ? 'null' : JSON.stringify(value);

/** Whether `record` holds each of `values`. */
export function holds(record: Record<string, unknown>, values: Record<string, unknown>): boolean {
  return Object.entries(values).every(([name, value]) => comparable(record[name]) === comparable(value));
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

/**
 * A finished read or list that can fold into a reply's "Looked at …" line:
 * one on a Homestead resource whose app doesn't draw that action itself (a
 * list card is worth seeing). Writes, failures and approvals always show.
 */
export function rollsUp(part: Pick<ToolUIPart, 'type' | 'state' | 'output' | 'errorText' | 'input'>): boolean {
  if (part.state !== 'output-available' || cardMode(part) !== 'done') return false;
  const owner = ownerForTool(part.type);
  const action = cardActionOf(part.input);
  if (!owner || (action !== 'read' && action !== 'list')) return false;
  return chatCardFor(owner, action) === undefined;
}

/**
 * A create on a Homestead resource that can join a batch (see `addBatch`):
 * running, finished or failed. One waiting on the person's approval, or
 * refused, keeps its own card — there is something to answer, or to notice.
 */
export function addsUp(part: Pick<ToolUIPart, 'type' | 'state' | 'input'>): boolean {
  if (part.state === 'approval-requested' || part.state === 'approval-responded' || part.state === 'output-denied') {
    return false;
  }
  return ownerForTool(part.type) !== undefined && cardActionOf(part.input) === 'create';
}

/** The run of reads a reply folds into one line. */
export const READS_RUN = 'reads';

/**
 * Which run a tool part can fold into, or null when it renders on its own:
 * reads of any resource fold together; adds fold per resource.
 */
export function runKeyOf(
  part: Pick<ToolUIPart, 'type' | 'state' | 'output' | 'errorText' | 'input'>,
): string | null {
  if (rollsUp(part)) return READS_RUN;
  if (addsUp(part)) return `adds:${part.type}`;
  return null;
}

/** Several adds to one resource, as one card reads them. */
export interface AddBatch {
  total: number;
  /** The records made so far, in the order they were asked for. */
  records: unknown[];
  /** Calls still running. */
  pending: number;
  /** Calls that failed: what was being added (its title, when the call named one), and why. */
  failed: { title?: string; error: string }[];
}

/** Sum up a run of creates on one resource. */
export function addBatch(
  parts: readonly Pick<ToolUIPart, 'state' | 'input' | 'output' | 'errorText'>[],
  titleOf: (fields: unknown) => string | undefined,
): AddBatch {
  const batch: AddBatch = { total: parts.length, records: [], pending: 0, failed: [] };
  for (const part of parts) {
    const mode = cardMode(part);
    if (mode === 'done') {
      batch.records.push(toolOutcome(part).result);
    } else if (mode === 'failed') {
      const title = titleOf((part.input as { fields?: unknown } | null | undefined)?.fields);
      batch.failed.push({ ...(title ? { title } : {}), error: toolOutcome(part).error || 'The call failed.' });
    } else {
      batch.pending++;
    }
  }
  return batch;
}

/** A message's parts as they render: one at a time, or a run folded together (`key`: which kind). */
export type PartGroup<P> =
  | { kind: 'one'; part: P; index: number }
  | { kind: 'run'; key: string; parts: P[]; index: number };

/**
 * Fold each run of two or more parts with the same run key (`runKeyOf`) into
 * one group. Parts that show nothing between them (a step boundary, an empty
 * text) don't break a run; anything else does, a part of another run
 * included. A lone part stays a card of its own.
 */
export function groupParts<P extends { type: string; text?: string }>(
  parts: readonly P[],
  runKey: (part: P) => string | null,
): PartGroup<P>[] {
  const out: PartGroup<P>[] = [];
  let run: { key: string; parts: P[]; index: number; skipped: { part: P; index: number }[] } | null = null;
  const flush = () => {
    if (!run) return;
    if (run.parts.length >= 2) out.push({ kind: 'run', key: run.key, parts: run.parts, index: run.index });
    else out.push({ kind: 'one', part: run.parts[0]!, index: run.index });
    for (const skipped of run.skipped) out.push({ kind: 'one', ...skipped });
    run = null;
  };
  parts.forEach((part, index) => {
    const silent = part.type === 'step-start' || part.type === 'reasoning' || (part.type === 'text' && !part.text?.trim());
    const key = runKey(part);
    if (key !== null) {
      if (run && run.key !== key) flush();
      run ??= { key, parts: [], index, skipped: [] };
      run.parts.push(part);
    } else if (silent && run) {
      run.skipped.push({ part, index });
    } else {
      flush();
      out.push({ kind: 'one', part, index });
    }
  });
  flush();
  return out;
}
