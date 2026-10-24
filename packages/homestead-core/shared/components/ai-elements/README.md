# AI Elements (vendored)

These chat components come from [AI Elements](https://github.com/vercel/ai-elements)
(`packages/elements/src/`, fetched from `main` in October 2026), the shadcn/ui
component set for AI interfaces. They are copied in — the shadcn way — rather
than installed, and are licensed under the Apache License 2.0 (see `LICENSE`).

They render against the shadcn semantic tokens, which
`homestead-app/src/shadcn-chat.css` maps onto the Homestead palette, and the
shadcn primitives under `../ui/` (Collapsible, Badge, ScrollArea, Tooltip and
InputGroup came in alongside them, from shadcn/ui's new-york-v4 registry, MIT).

## What was changed from upstream

Every file swaps `@repo/shadcn-ui/...` imports for this repo's paths. Beyond
that:

| File | Change |
|---|---|
| `conversation.tsx` | As upstream. |
| `message.tsx` | `Message`, `MessageContent`, `MessageActions`, `MessageAction`, `MessageResponse` only (no branch UI). `MessageResponse` renders with Streamdown's core alone: no code (Shiki), math (KaTeX), Mermaid, or CJK plugins, to keep the bundle small. |
| `prompt-input.tsx` | The text-only subset: `PromptInput` (a form), `PromptInputBody`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputTools`, `PromptInputSubmit` (status-aware, with stop). No attachments, menus, model select, or command palette yet. |
| `tool.tsx` | Parameters and results render as a plain JSON `<pre>` instead of the Shiki `CodeBlock`. The card sets `border-border` itself: shadcn's base layer colors every border, and this app's CSS doesn't. |
| `suggestion.tsx` | As upstream. |
| `shimmer.tsx` | The sweep is a CSS animation (`animate-text-shimmer` in `globals.css`) instead of `motion`, so no animation library is needed. |

To take a newer upstream version, diff against these notes rather than
overwriting: the changes above are deliberate.
