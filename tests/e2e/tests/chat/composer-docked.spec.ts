/**
 * The chat's text bar stays on screen: at phone size, with a title that wraps
 * and a reply far longer than the screen, the composer is in view and the
 * page itself doesn't scroll — only the conversation does. Layout, so it
 * needs a real browser (the VM tier has no layout engine).
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { playwrightDriver } from '../../../../packages/homestead-test-harness/driver/pw-driver';
import { ChatPage } from '../../pages/ChatPage';
import { CHAT_MARKERS, LONG_REPLY_TEXT } from '../../config/ai-scripts';

test.use({ viewport: { width: 390, height: 664 } });

test.describe('Chat text bar', () => {
  test('stays docked on screen while a long reply fills the conversation', async ({
    page,
    authenticatedPage,
  }) => {
    const chat = new ChatPage(playwrightDriver(authenticatedPage));
    await chat.goto();
    // Sent with Enter: at phone width the dev-only query devtools button sits
    // over the send button, and this spec is about layout, not that button.
    const input = page.getByTestId('chat-input');
    await input.fill(`Tell me everything about the plans for next week ${CHAT_MARKERS.longReply}`);
    await input.press('Enter');
    await expect(
      page.getByTestId('chat-messages').getByText(LONG_REPLY_TEXT.split(' ').slice(-3).join(' ')),
    ).toBeVisible({ timeout: 20_000 });

    const viewport = page.viewportSize()!;
    const box = (await page.getByTestId('chat-input').boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    // Nothing outside the conversation scrolls: not the document, not the
    // shell's main area.
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      return {
        document: document.scrollingElement!.scrollHeight - window.innerHeight,
        main: main.scrollHeight - main.clientHeight,
      };
    });
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(overflow.main).toBeLessThanOrEqual(0);
  });
});
