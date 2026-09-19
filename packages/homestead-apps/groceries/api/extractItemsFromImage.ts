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

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  const base64Image = await fileToBase64(imageFile);

  const response = await aepbase.customMethod<{
    items: ExtractedGroceryItem[];
    message: string;
  }>(GROCERIES, 'process-image', {
    image: base64Image,
    mimeType: imageFile.type,
  });
  return response.items;
}
