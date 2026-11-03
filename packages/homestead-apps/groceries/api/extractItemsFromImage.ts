/**
 * Client half of the grocery photo import: hand an image to this app's
 * `groceries:process-image` custom method and get back the items the model read
 * off it. The server half (which holds the API key and talks to the model) is
 * `../methods/process-image.ts`.
 *
 * Lived in `homestead-core/services/gemini.ts` until it was noticed that core
 * was calling one feature app's custom method by name — the only consumer was
 * ever this app, so it belongs here.
 */

import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { GROCERIES } from '../resources';

export interface ExtractedGroceryItem {
  name: string;
}

/**
 * Errors propagate as thrown: the mutation this runs under toasts them with
 * the server's own message (e.g. "AI is not configured"), which beats the
 * generic wording this used to substitute.
 */
export async function extractGroceryItemsFromImage(
  imageFile: File,
): Promise<ExtractedGroceryItem[]> {
  const response = await aepbase.customMethod<{
    items: ExtractedGroceryItem[];
    message: string;
  }>(GROCERIES, 'process-image', { image: imageFile });
  return response.items;
}
