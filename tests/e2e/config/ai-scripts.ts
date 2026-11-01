/**
 * Scripted chat turns for the AI stub (`./ai-stub.ts`).
 *
 * A real model decides what to call; a test needs it to decide the same thing
 * every time. A script is that decision written down: a sequence of steps, each
 * either tool calls or a text reply. A test puts the script's marker in the
 * message it sends, and the stub answers the turn from the script instead of
 * from the document payloads.
 *
 * **Which step.** Chat's agent loop calls the model once per round, sending the
 * whole conversation each time, with a `function_call_output` for every tool
 * result so far. The stub answers with step N, where N is the number of tool
 * results *after the latest user message* — so round one gets step 0, the round
 * after the first tool call gets step 1, and a new user message starts over.
 * Past the last step the stub replies with {@link SCRIPT_EXHAUSTED_TEXT}, so a
 * test that expects more rounds than its script has fails on visible text
 * rather than hanging.
 *
 * Scripts are declared here, statically, rather than registered at runtime:
 * the Playwright suite runs the stub in its own process, so a spec could not
 * reach a runtime registry. Both tiers import the same table.
 */

/** One tool call the scripted model makes. `name` is the tool as chat registers it. */
export interface ScriptedToolCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * One model round: tool calls (the loop runs them and calls back), or a text
 * reply (which ends the turn). A step may carry both, as a real model can.
 */
export interface ScriptStep {
  toolCalls?: ScriptedToolCall[];
  text?: string;
}

export interface ChatScript {
  /** Text a test puts in its message to select this script. Unique. */
  marker: string;
  steps: ScriptStep[];
}

/** The reply once a script has no step left for the round being asked for. */
export const SCRIPT_EXHAUSTED_TEXT = '[ai-stub] script exhausted';

/**
 * In a step's text, replaced by what files the message carried as the model
 * saw them: `I can see 1 image and 1 PDF.` — so a test can check that
 * attachments reached the model, not just storage.
 */
export const ATTACHMENTS_PLACEHOLDER = '{attachments}';

/**
 * In a script's reply text, replaced by the tools the request offered the
 * model, sorted, each with the `action` values it accepts:
 * `gift_cards(list get create update delete) | todos(list get)` — so a test can
 * check what the model was allowed to try, not just what it did.
 */
export const TOOLS_PLACEHOLDER = '{tools}';

/**
 * In a script's reply text, replaced by what the system prompt told the model
 * about its situation: `now=<its Now line> | notes=<app note headings>`, e.g.
 * `now=Saturday 2026-10-24, 7:42 PM (America/Chicago) | notes=People, Todos`.
 */
export const CONTEXT_PLACEHOLDER = '{context}';

/**
 * In a step's text, replaced by the output of the turn's latest tool call, as
 * the model received it (the raw `function_call_output`) — so a test can check
 * how a result was framed for the model, not just that the call ran.
 */
export const TOOL_OUTPUT_PLACEHOLDER = '{tool-output}';

/**
 * The id the MCP chat specs give their test server, so a script can name its
 * tools (`mcp_<server id>__<tool>`, see `mcpToolName`).
 */
export const MCP_TEST_SERVER_ID = 'ha';

/**
 * In a tool call's arguments, replaced by the attachment id of the first file
 * the message carried (the model is shown `attachment id: …` beside each) — so
 * a script can file an attachment whose id it can't know in advance.
 */
export const ATTACHMENT_ID_PLACEHOLDER = '{attachment}';

/**
 * In a step's tool-call args, `{user-id:Sam}` is replaced by the user id the
 * prompt's Household section gives that name — so a script can message
 * someone whose id it can't know in advance.
 */
export const USER_ID_PLACEHOLDER = /\{user-id:([^}]+)\}/g;

/**
 * Markers, exported so a spec names its script by constant. Kept distinctive
 * so ordinary test text can never select one by accident.
 */
export const CHAT_MARKERS = {
  /** Add milk to the grocery list, then confirm. */
  addMilk: 'e2e-chat-add-milk',
  /** List groceries with a filter, then summarize. */
  listUnchecked: 'e2e-chat-list-unchecked',
  /** Answer in text with no tool call — the plain streaming case. */
  hello: 'e2e-chat-hello',
  /**
   * A long text reply (200 words, so ~1s at the VM's 5ms chunk pace): long
   * enough to cancel, interrupt, or collide with while it is still streaming.
   */
  longReply: 'e2e-chat-long-reply',
  /** Reply with what files the message carried, as the model saw them. */
  describeAttachments: 'e2e-chat-describe-attachments',
  /** Save the attached photo as a new gift card's front image, then confirm. */
  fileGiftCard: 'e2e-chat-file-gift-card',
  /** Reply with the tools the model was offered (see TOOLS_PLACEHOLDER). */
  listTools: 'e2e-chat-list-tools',
  /** Reply with the prompt's clock and app notes (see CONTEXT_PLACEHOLDER). */
  describeContext: 'e2e-chat-describe-context',
  /** A Markdown reply: a bulleted list with bold names, then a table. */
  formattedReply: 'e2e-chat-formatted-reply',
  /** A reply marking typed values: an address, phone, email, and two bad ones. */
  typedValues: 'e2e-chat-typed-values',
  /** Look a person up by a first name, loosely (name or alias), then answer. */
  findPerson: 'e2e-chat-find-person',
  /** "Jake's address": find Jake with his households in one call, then repeat what came back. */
  jakesAddress: 'e2e-chat-jakes-address',
  /** Message Sam (an approval-gated `:send`), then say so. */
  messageSam: 'e2e-chat-message-sam',
  /** Read a light's state from the test MCP server, then repeat what came back. */
  mcpCheckLight: 'e2e-chat-mcp-check-light',
  /** Unlock the front door on the test MCP server (an "ask first" tool), then say so. */
  mcpUnlockDoor: 'e2e-chat-mcp-unlock-door',
  /** Call the test MCP server's failing tool, then repeat what came back. */
  mcpFailing: 'e2e-chat-mcp-failing',
} as const;

/** The long reply's text, exported so a spec can check the whole of it arrived. */
export const LONG_REPLY_TEXT = Array.from({ length: 200 }, (_, i) => `word${i + 1}`).join(' ');

export const CHAT_SCRIPTS: readonly ChatScript[] = [
  {
    marker: CHAT_MARKERS.addMilk,
    steps: [
      { toolCalls: [{ name: 'groceries', args: { action: 'create', fields: { name: 'Milk' } } }] },
      { text: 'Added milk to the grocery list.' },
    ],
  },
  {
    marker: CHAT_MARKERS.listUnchecked,
    steps: [
      {
        toolCalls: [
          {
            name: 'groceries',
            args: { action: 'list', filter: 'checked == false', order_by: 'name', limit: 20 },
          },
        ],
      },
      { text: 'Here is what is still on the list.' },
    ],
  },
  {
    marker: CHAT_MARKERS.findPerson,
    steps: [
      {
        toolCalls: [
          {
            name: 'people',
            args: {
              action: 'list',
              filter: 'name.contains("jake") || aliases.exists(a, a.contains("jake"))',
            },
          },
        ],
      },
      { text: 'Here is who I found.' },
    ],
  },
  {
    marker: CHAT_MARKERS.typedValues,
    steps: [
      {
        text: [
          '**Jake Miller**',
          '',
          '- Address: [12 Oak St, Springfield, IL 62704](homestead:address)',
          '- Phone: [(555) 123-4567](homestead:phone)',
          '- Email: [jake@example.com](homestead:email)',
          '- Ship: [a spaceship](homestead:spaceship)',
          '- Odd: [sneaky](homestead:address/../x)',
          '- Unsafe: [click](javascript:alert(1))',
        ].join('\n'),
      },
    ],
  },
  {
    marker: CHAT_MARKERS.formattedReply,
    steps: [
      {
        text: [
          'Two people match:',
          '',
          '- **Jake Miller**: 12 Oak St, Springfield',
          '- **Jacob Stone**: 48 Elm Ave, Shelbyville',
          '',
          '| Card | Balance |',
          '| --- | --- |',
          '| REI | **$25.00** |',
          '| Target | **$10.00** |',
        ].join('\n'),
      },
    ],
  },
  {
    marker: CHAT_MARKERS.hello,
    steps: [{ text: 'Hello from the scripted assistant. How can I help?' }],
  },
  {
    marker: CHAT_MARKERS.longReply,
    steps: [{ text: LONG_REPLY_TEXT }],
  },
  {
    marker: CHAT_MARKERS.describeAttachments,
    steps: [{ text: ATTACHMENTS_PLACEHOLDER }],
  },
  {
    marker: CHAT_MARKERS.listTools,
    steps: [{ text: TOOLS_PLACEHOLDER }],
  },
  {
    marker: CHAT_MARKERS.describeContext,
    steps: [{ text: CONTEXT_PLACEHOLDER }],
  },
  {
    marker: CHAT_MARKERS.fileGiftCard,
    steps: [
      {
        toolCalls: [
          {
            name: 'gift_cards',
            args: {
              action: 'create',
              fields: {
                merchant: 'REI',
                card_number: '1234',
                amount: 50,
                front_image: ATTACHMENT_ID_PLACEHOLDER,
              },
            },
          },
        ],
      },
      { text: 'Saved the REI gift card with its photo.' },
    ],
  },
  {
    marker: CHAT_MARKERS.messageSam,
    steps: [
      {
        toolCalls: [
          {
            name: 'notifications',
            args: {
              action: ':send',
              user_id: '{user-id:Sam}',
              body: { title: 'Running late', body: 'Be there by 6:30' },
            },
          },
        ],
      },
      // After the person's answer: the call ran (or was denied), and the
      // model has its outcome.
      { text: 'Done.' },
    ],
  },
  {
    marker: CHAT_MARKERS.jakesAddress,
    steps: [
      {
        toolCalls: [
          {
            name: 'people',
            args: {
              action: 'list',
              filter: 'name.contains("jake") || aliases.exists(a, a.contains("jake"))',
              include: ['households'],
            },
          },
        ],
      },
      { text: `Found: ${TOOL_OUTPUT_PLACEHOLDER}` },
    ],
  },
  {
    marker: CHAT_MARKERS.mcpCheckLight,
    steps: [
      { toolCalls: [{ name: `mcp_${MCP_TEST_SERVER_ID}__get_state`, args: { entity: 'light.kitchen' } }] },
      { text: `The service said: ${TOOL_OUTPUT_PLACEHOLDER}` },
    ],
  },
  {
    marker: CHAT_MARKERS.mcpUnlockDoor,
    steps: [
      { toolCalls: [{ name: `mcp_${MCP_TEST_SERVER_ID}__unlock`, args: { entity: 'lock.front' } }] },
      { text: 'Done.' },
    ],
  },
  {
    marker: CHAT_MARKERS.mcpFailing,
    steps: [
      { toolCalls: [{ name: `mcp_${MCP_TEST_SERVER_ID}__fail`, args: {} }] },
      { text: `The service said: ${TOOL_OUTPUT_PLACEHOLDER}` },
    ],
  },
];

/** The script whose marker appears in `text`, if any. */
export function scriptFor(text: string): ChatScript | undefined {
  return CHAT_SCRIPTS.find((script) => text.includes(script.marker));
}
