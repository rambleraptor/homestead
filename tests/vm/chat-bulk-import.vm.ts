/**
 * The assistant importing through `:bulk-import`, on the VM tier.
 *
 * The scripted model calls the recipes tool's `:bulk-import` action with the
 * same body every client sends: a `validate_only` preview (no approval), then
 * the `preview_id` — which waits for the person, whose card lists the rows.
 * A file comes from the conversation's attachments, by attachment id.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { ChatPage } from '../e2e/pages/ChatPage';
import { listOrEmpty } from '../e2e/utils/aepbase-helpers';
import { CHAT_MARKERS } from '../e2e/config/ai-scripts';
import { RECIPE_MARKERS } from '../e2e/config/ai-stub';

describe('Chat — bulk import', { timeout: 30_000 }, () => {
  let h: Harness;
  let token: string;

  beforeEach(async () => {
    h = await bootHomestead();
    // Recipes is enabled for superusers by default.
    ({ token } = await h.loginAs(h.admin));
  });

  afterEach(async () => {
    await h.close();
  });

  async function ask(chat: ChatPage) {
    await chat.goto();
    await chat.send(`Save this recipe ${CHAT_MARKERS.importRecipe}`);
    // The preview ran without asking; the write waits, listing what it saves.
    await h.driver.expect(chat.approvalCard).toBeVisible();
    await h.driver
      .expect(h.driver.getByTestId('chat-approval-import-rows'))
      .toContainText('Garlic Noodles');
    await h.driver.expect(chat.approvalCard).toContainText('Import 1 row');
    expect(await listOrEmpty(token, 'recipes')).toEqual([]);
  }

  test('previews without asking, then imports the previewed rows on Approve', async () => {
    const chat = new ChatPage(h.driver);
    await ask(chat);
    await chat.answerApproval(true);
    await h.driver.expect(chat.messages).toContainText('Imported it.');

    const recipes = await listOrEmpty<{ title: string; steps?: string[] }>(token, 'recipes');
    expect(recipes.map((r) => r.title)).toEqual(['Garlic Noodles']);
    expect(recipes[0]!.steps).toEqual(['Boil the noodles.', 'Toss with the garlic.']);
  });

  test('Deny imports nothing', async () => {
    const chat = new ChatPage(h.driver);
    await ask(chat);
    await chat.answerApproval(false);
    await h.driver.expect(chat.messages).toContainText('Imported it.');
    await h.driver.expect(chat.toolCalls.last()).toContainText('Denied');
    expect(await listOrEmpty(token, 'recipes')).toEqual([]);
  });

  test('reads an attached screenshot, by attachment id', async () => {
    const chat = new ChatPage(h.driver);
    await chat.goto();
    // A PNG the AI stub reads as a recipe (see RECIPE_MARKERS).
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      Buffer.from(RECIPE_MARKERS.one),
    ]);
    await chat.attach({ name: 'recipe.png', mimeType: 'image/png', buffer: png });
    await chat.send(`What recipe is this? ${CHAT_MARKERS.previewScreenshot}`);

    // The preview reached the model, labelled as untrusted outside content.
    await h.driver.expect(chat.messages).toContainText('Garlic Fried Rice');
    await h.driver.expect(chat.messages).toContainText('"untrusted":true');
    // A preview writes nothing and asks nothing.
    await h.driver.expect(chat.approvalCard).toHaveCount(0);
    expect(await listOrEmpty(token, 'recipes')).toEqual([]);
  });
});
