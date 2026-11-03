# Agent cards — Design and implementation plan

**Status:** Proposed · **Audience:** contributors

> How a tool call in an assistant reply renders as a card the person can read
> and act on, instead of a JSON disclosure — and how the record half of that
> card is reused wherever the UI shows a record it doesn't otherwise know how
> to draw (change toasts, the inbox, reference fields).

---

## 1. The problem

A reply's tool calls render through `ToolCall` in
`homestead-core/chat/components/ChatMessage.tsx`: the AI Elements `Tool`
collapsible with a `resource · action` title and the input and output as JSON
code blocks. It is honest but unreadable, and nothing on it can be acted on.
"Added milk" is a sentence next to a `{ "ok": true, "result": { … } }` block
rather than a grocery item with a checkbox.

Everything the UI would need is already there. The AI SDK tool part carries
the tool name (`tool-<snake(plural)>`), the `action` in its input, the fields
the model sent, and the executor's result (secret fields already dropped by
`withoutSecrets` in `server/chat/execute.ts`). The model and the server need
no change. This is purely a rendering seam on the SPA side.

## 2. The model: two layers

The chat-specific part of a card is the **action framing**: proposed, running,
done, denied, failed; "was / now" for an update; the recipient of a send. The
part underneath is a **record card**: a compact, live rendering of one record
of a given resource with that app's own actions. Only the second part is
reusable outside chat, so the contract is split in two:

- `AppConfig.records` — record cards by resource singular. Chat consumes them,
  and so can change toasts, the notifications inbox, reference fields and
  cross-app widgets: anywhere the host doesn't know the resource.
- `AppConfig.chat.cards` — chat cards by resource singular (or
  `<singular>:<verb>` for a custom method), for the cases where the action
  matters more than the record (a list result, a sent message). Optional: an
  app that declares only `records` gets good chat cards for free.

Resolution when the chat renders a tool part, in order:

1. an app `chat.cards` entry whose `actions` claim this action;
2. the generic action card wrapping the app's `records` card;
3. the generic action card with the shared title heuristic.

MCP tools (`mcp_<server>__<tool>`) and the search tool skip straight to the
generic card.

### 2.1 Contract

```ts
// packages/homestead-core/apps/types.ts

/** A compact, live rendering of one record, usable anywhere the host doesn't know the resource. */
export interface RecordCardProps {
  id: string;
  /** A point-in-time copy the caller already has (a tool result, a change event). The card refetches live. */
  snapshot?: unknown;
  /** How much room there is: a row in a list or toast, or a standalone card. */
  size: 'row' | 'card';
}

export interface RecordCardType {
  component: LazyComponent<RecordCardProps>;
}

export type ChatCardAction = 'create' | 'read' | 'update' | 'delete' | 'list' | `:${string}`;

/** A tool call rendered in a reply: the action framing around a record (or a list of them). */
export interface ChatCardProps {
  resource: ResourceDefinition;
  action: ChatCardAction;
  /** proposed: waiting on approval. running: input known, no result yet. */
  mode: 'proposed' | 'running' | 'done' | 'denied' | 'failed';
  /** The call as the model made it: `fields`, `id`, ancestor ids, `body` for a `:verb`. */
  input: Record<string, unknown>;
  /** The executor's result on `done`: a record, `{ records }` for list, `{ deleted, id }` for delete. May be a capped preview. */
  result?: unknown;
  error?: string;
}

export interface ChatCardType {
  component: LazyComponent<ChatCardProps>;
  /** Actions this card renders; the generic card takes the rest. Default: all. */
  actions?: readonly ChatCardAction[];
}

export interface AppChatConfig {
  // …instructions, context, values as today
  /** Keyed by resource singular, or `<singular>:<verb>` for a custom method. Falls back to the record card. */
  cards?: Readonly<Record<string, ChatCardType>>;
}

export interface AppConfig {
  // …
  /** Record cards by resource singular. Chat, toasts, the inbox and reference fields render through these. */
  records?: Readonly<Record<string, RecordCardType>>;
}
```

```ts
// packages/homestead-core/chat/cards.ts — what a card can reach from the thread

export interface ChatCardContext {
  conversationId: string | null;
  /** Put a follow-up into this conversation ("Move this to tomorrow"). */
  send: (text: string) => Promise<void>;
  /** A turn is running, so actions that send should wait. */
  busy: boolean;
}
export function useChatCard(): ChatCardContext;
```

```ts
// packages/homestead-core/records/useRecordCard.ts — the live record behind a card

export function useCardRecord<T>(
  def: ResourceDefinition,
  id: string,
  snapshot?: unknown,
): { data: T | undefined; deleted: boolean; isPending: boolean };
```

### 2.2 Rules every card follows

- **Live, not a snapshot.** The tool result is a point-in-time copy, and a
  stored output over `STORED_OUTPUT_CAP` (`server/chat/turns.ts`) is replaced
  by a preview before it is saved. A card treats `snapshot`/`result` as
  placeholder data and refetches by id through `useCardRecord`, which wraps
  `useResourceItem` (so the change feed updates it and the mutation factory
  keeps it in step). A 404 reads as `deleted`.
- **Links come from the app, never from the reply.** Any link a card renders
  is built from the record id and the app's own routes — the same rule
  `chat/values.ts` enforces for typed values. A card never reads a URL out of
  model text.
- **Secrets stay hidden.** The result already carries no secret values;
  `encrypted` fields (a gift card's `card_number`, `pin`) render only behind a
  deliberate reveal, as the app's own screens do.
- **Actions go through the app's hooks.** A checkbox on a todo card calls
  `useUpdateTodo`, so the write lands in the outbox and works offline. A
  conversational action calls `send()` from `useChatCard`.
- **The JSON stays reachable.** The card is the collapsed face of the
  existing `Tool` collapsible; expanding shows `ToolInput`/`ToolOutput` under a
  "Details" heading. `data-testid="chat-tool-call"` and `ChatPage.openToolCall`
  keep working.

## 3. Components

### 3.1 Dispatch (`chat/cards.ts`, `chat/components/ChatCard.tsx`)

`chat/cards.ts` is runtime-free like `chat/values.ts`. It builds, once, a map
from tool name to its owner using `getAllResourceDefsWithApp()`:

```ts
interface CardOwner { app: AppConfig; def: ResourceDefinition; }
export function ownerForTool(toolType: string): CardOwner | undefined; // 'tool-gift_cards' → gift-card
export function cardFor(owner: CardOwner, action: ChatCardAction): ChatCardType | undefined;
export function recordCardFor(singular: string): RecordCardType | undefined;
export function toolMode(state: ToolUIPart['state']): ChatCardProps['mode'];
```

`snake` (hyphen → underscore) moves from `server/chat/tools.ts` to a shared
runtime-free module (`chat/tool-names.ts`) so the SPA never imports server
code; the server re-exports it.

`ChatCard.tsx` replaces the body of `ToolCall` in `ChatMessage.tsx`:

```
<Tool>
  <CollapsibleTrigger>  ← the card itself (app card | generic action card)
  <ToolContent>         ← "Details": ToolInput + ToolOutput, as today
</Tool>
```

`ToolHeader` from AI Elements stays for MCP and search tools. For resource
tools the trigger renders the card; the status badge and chevron sit in the
card's corner.

### 3.2 The generic action card (`chat/components/GenericActionCard.tsx`)

No app work; every resource gets it on day one.

| action   | shows                                                                 |
|----------|-----------------------------------------------------------------------|
| create   | app icon · "Added <singular_name>" · title · the fields sent, as rows |
| read     | app icon · title · a few leading fields                               |
| update   | app icon · "Changed <singular_name>" · title · was/now per changed field (from `input.fields` against the result; "was" absent when the prior value isn't known) |
| delete   | app icon · "Removed <singular_name>" · title struck through           |
| list     | app icon · "<count> <plural_name>" · first five titles · "more" line  |
| `:verb`  | app icon · "<Singular name>: <verb>" · body as rows                   |

`mode` drives the chrome: `proposed` (amber, as `ApprovalCard` today),
`running` (skeleton over the known fields, pulsing badge), `denied`, `failed`
(the engine's error text, red). When the owner has a `records` card, the
title/fields area is replaced by that card at `size: 'card'` (or `'row'` per
item under `list`).

The title heuristic is `pickTitle` from `server/chat/search-tool.ts`, moved to
`resources/display.ts` (`recordTitle(def, record)`) and shared by search, cards
and toasts.

### 3.3 The record card helper (`records/`)

- `records/useRecordCard.ts` — `useCardRecord` above. Needs the owning app id
  for the query key; `ownerForTool`/`recordCardFor` supply it.
- `records/components/RecordCard.tsx` — `<RecordCard singular id snapshot size />`:
  resolves the app's record card through the registry and renders it under
  `Suspense`, with the generic title line as the fallback. This is the one
  component every non-chat host uses.

### 3.4 Approvals

`ApprovalCard` keeps the Approve/Deny buttons and the recipient lookup and
renders `<ChatCard mode="proposed">` above them, built from the input alone.
A `notification:send` chat card shows the message as the inbox bubble the
recipient will see. The `chat-approval*` test ids are unchanged.

### 3.5 Read rollup

Consecutive `read`/`list` parts on resources with no app `list` card collapse
into one quiet "Looked at todos, groceries" line with one disclosure. Writes,
failures and approvals always render individually. Implemented as a grouping
pass over `message.parts` in `ChatMessage` before rendering.

## 4. Where record cards are reused

- **Change toasts.** `useChangeToasts` gains an optional `render` so a
  created/updated change can toast the record card at `size: 'row'` with the
  actor line above it. Todos and groceries keep their `describe` sentences as
  the fallback text.
- **Notifications inbox.** A row with `source_collection`/`source_id` renders
  the record card under the message when the resource declares one.
- **Reference fields.** `ReferenceField` renders a chosen record as the record
  card at `size: 'row'` when one exists, else `labelField` as today.
- **Cross-app widgets** (later): a "Recent changes" widget over
  `useRecentRemoteChanges` rendering record cards.

## 5. Phases

Each phase is one PR, green on `make ci && make test`, with VM specs through
scripted turns in `tests/e2e/config/ai-scripts.ts`.

### Phase 1 — platform: generic cards for every tool call

No app changes. Every reply reads better immediately.

- `apps/types.ts`: `RecordCardProps`, `RecordCardType`, `ChatCardAction`,
  `ChatCardProps`, `ChatCardType`, `AppChatConfig.cards`, `AppConfig.records`.
  Declared now so Phase 2 adds no renames.
- `chat/tool-names.ts` (`snake`), `resources/display.ts` (`recordTitle`);
  `server/chat/tools.ts` and `search-tool.ts` import from them.
- `chat/cards.ts` (owner map, `cardFor`, `toolMode`) + unit tests.
- `chat/components/ChatCard.tsx`, `GenericActionCard.tsx`; `ChatMessage.tsx`
  routes resource tool parts through `ChatCard`, MCP/search unchanged.
- `ApprovalCard` renders the proposed card above its buttons.
- Page object: `ChatPage.cards` (`chat-card`), `cardFor(singular)`
  (`chat-card-<singular>`), `cardTitle`.
- VM specs (`tests/vm/chat-cards.vm.ts`): `addMilk` shows a grocery create
  card titled "Milk"; `listUnchecked` shows a list card with a count; a new
  `updateTodo` script shows was/now; a new `deleteTodo` script shows the
  struck title; `messageSam` approval shows the proposed card; `mcpCheckLight`
  still renders the MCP header. Reopening a conversation from history renders
  the same cards from stored parts.

### Phase 2 — app cards: todos, groceries, notifications

- `records/useRecordCard.ts`, `records/components/RecordCard.tsx`,
  `chat/cards.ts` gains `ChatCardContext`/`useChatCard`; `ChatThread`
  provides it from `useConversation` (`send`, `busy`, `conversationId`).
- Todos: `records.todo` → `components/TodoCard.tsx` (title, category, project,
  checkbox via `useUpdateTodo`, "Reschedule" → `send`). `chat.cards.todo` for
  `list` → `TodoListCard.tsx` (overdue first, "Push overdue to tomorrow").
- Groceries: `records.grocery` → `GroceryCard.tsx` (checkbox, store);
  `chat.cards.grocery` for `list` → `GroceryListCard.tsx` grouped by store.
- Notifications (core): `chat.cards['notification:send']` → the inbox bubble
  in `proposed` and `done` modes.
- Specs: per-app `vm/<app>-chat-cards.vm.ts` using the existing scripts plus
  a `listTodos` script; ticking a card's checkbox updates the todo (seeded via
  `e2eClient`) and the card reflects a change made by `h.householdMember`.

### Phase 3 — undo, rollup, reuse outside chat

- **Undo** on `update` (patch previous values from the was/now diff) and
  `delete` (recreate from `input.fields`), via the app's hooks through
  `RecordCard`'s owner; shown for the session only.
- **Read rollup** (§3.5).
- **Change toasts** `render` option, used by todos and groceries.
- **Inbox** and **ReferenceField** rendering through `RecordCard`.

## 6. Out of scope (for now)

- A `record` typed value so the model can link a record in prose. Would
  share `RecordCard`; needs a prompt change, so it is its own design.
- Clarifying-question cards ("Which Jake?") — needs a model-side contract.
- A `display: { title }` hint on `ResourceDefinition`. Start with the shared
  heuristic (`title`, `name`, `merchant`, …); add the hint only when an app
  needs it, and then feed search and cards from it together.
- Replacing in-app list rows with record cards. Each app's list is tuned for
  its data; record cards are for hosts that don't know the resource.

## 7. Open questions

- Should `update` cards show "was" when the stored part has no prior value?
  Phase 1 shows only "now" in that case; Phase 3's undo would want the prior
  value, which means the executor recording it (a server change, small).
- Does `list` under an app card want paging? The executor caps at `limit`;
  the card shows what came back plus the executor's "more matched" note.
