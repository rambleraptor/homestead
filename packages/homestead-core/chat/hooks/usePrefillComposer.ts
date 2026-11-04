/**
 * Put `text` in a composer's textarea and focus it, without sending. The
 * composer (`PromptInput`) is uncontrolled — its form reads the textarea on
 * submit and resets it after — so the draft is written to the field itself,
 * not passed as `defaultValue` (which a reset would bring back after a send).
 */

import { useEffect, type RefObject } from 'react';

export function usePrefillComposer(
  container: RefObject<HTMLElement | null>,
  text: string | undefined,
): void {
  useEffect(() => {
    if (!text) return;
    const field = container.current?.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
    if (!field) return;
    field.value = text;
    field.focus();
    field.setSelectionRange(text.length, text.length);
  }, [container, text]);
}
