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
 * In a tool call's arguments, replaced by the attachment id of the first file
 * the message carried (the model is shown `attachment id: …` beside each) — so
 * a script can file an attachment whose id it can't know in advance.
 */
export const ATTACHMENT_ID_PLACEHOLDER = '{attachment}';

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
];

/** The script whose marker appears in `text`, if any. */
export function scriptFor(text: string): ChatScript | undefined {
  return CHAT_SCRIPTS.find((script) => text.includes(script.marker));
}
