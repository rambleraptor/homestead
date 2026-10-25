# AI Elements (vendored)

These chat components come from [AI Elements](https://github.com/vercel/ai-elements)
(`packages/elements/src/`, fetched from `main` in October 2026), the shadcn/ui
component set for AI interfaces. They are copied in — the shadcn way — rather
than installed, and are licensed under the Apache License 2.0 (see `LICENSE`).

They render against the shadcn semantic tokens, which
`homestead-app/src/shadcn-chat.css` maps onto the Homestead palette, and the
shadcn primitives under `../ui/` (Collapsible, Badge, ScrollArea, Tooltip,
InputGroup and Select came in alongside them, from shadcn/ui's new-york-v4
registry, MIT).

## What was changed from upstream

Every file swaps `@repo/shadcn-ui/...` imports for this repo's paths. Beyond
that:

| File | Change |
|---|---|
| `conversation.tsx` | As upstream. |
| `message.tsx` | `Message`, `MessageContent`, `MessageActions`, `MessageAction`, `MessageResponse` only (no branch UI). `MessageResponse` renders with Streamdown's core alone: no code (Shiki), math (KaTeX), Mermaid, or CJK plugins, to keep the bundle small. |
| `prompt-input.tsx` | The subset chat uses: `PromptInput` (a form, with local file attachments — picker, paste, drop, `accept` / `maxFiles` / `maxFileSize`), `PromptInputBody`, `PromptInputTextarea`, `PromptInputHeader`, `PromptInputFooter`, `PromptInputTools`, `PromptInputButton`, `PromptInputSubmit` (status-aware, with stop), and `PromptInputActionAddAttachments` as a button rather than a menu item. No provider, menus, model select, referenced sources, screenshots, or command palette. If a send fails, its text and files go back into the composer. On send, files become data URLs read from the `File` itself (`arrayBuffer`), not by fetching the blob URL through a `FileReader`. |
| `attachments.tsx` | As upstream, minus the hover-card preview (`AttachmentHoverCard*`). |
| `tool.tsx` | As upstream, except the card sets `border-border` itself: shadcn's base layer colors every border, and this app's CSS doesn't. |
| `code-block.tsx` | As upstream (Shiki highlighting, copy button, language selector), with the same `border-border` on its container and header. Shiki is pinned to upstream's version. |
| `suggestion.tsx` | As upstream. |
| `shimmer.tsx` | The sweep is a CSS animation (`animate-text-shimmer` in `globals.css`) instead of `motion`, so no animation library is needed. |

To take a newer upstream version, diff against these notes rather than
overwriting: the changes above are deliberate.
