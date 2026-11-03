/**
 * `grocery-items:process-image` custom method (AEP-136).
 *
 * Lives on the grocery collection; dispatched by the sidecar gateway as
 * `POST /api/aep/groceries:process-image`. Body: `{ image }` — the photo as an
 * uploaded file (multipart, the custom-method body convention).
 * Returns `{ items: [{ name }], message }`.
 */

import type { CustomMethodHandler } from '@rambleraptor/homestead-core/resources/types';
import { isAiConfigured } from '@rambleraptor/homestead-core/server/ai/config';
import { readMethodBody } from '@rambleraptor/homestead-core/resources/custom-methods/body';
import { problemResponse } from '@rambleraptor/homestead-core/resources/problem';
import {
  aiGenerateText,
  type ModelMessage,
} from '@rambleraptor/homestead-core/server/ai/generate';

interface ExtractedItem {
  name: string;
}

async function extractGroceryItemsFromImage(
  imageBase64: string,
  mimeType: string,
): Promise<ExtractedItem[]> {
  const prompt = `You are a grocery list reader. Analyze this image of a handwritten or printed grocery list and extract all the grocery items.

Rules:
- Extract grocery item names WITH quantities if they are specified
- Return one item per line
- Include quantities in natural format (e.g., "2 gallons milk", "3 lbs chicken breast", "1 bunch bananas")
- If no quantity is specified, just include the item name
- If an item is crossed out or checked, still include it
- Clean up any messy handwriting to readable item names
- Do not include checkmarks or other annotations
- Do not include any other text, explanations, or formatting
- If the image doesn't contain a grocery list, return an empty response

Example output format:
2 gallons milk
1 loaf bread
1 dozen eggs
3 lbs chicken breast
Lettuce
6 apples`;

  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'file', data: imageBase64, mediaType: mimeType },
      ],
    },
  ];
  const text = (await aiGenerateText({ messages })).trim();

  return text
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !item.startsWith('*') && !item.startsWith('-'))
    .map((item) => item.replace(/^[•\-*]\s*/, '').trim())
    .filter((item) => item.length > 0)
    .map((item): ExtractedItem => ({ name: item }));
}

const handler: CustomMethodHandler = async ({ request, auth }) => {
  if (!isAiConfigured()) {
    return problemResponse(503, 'AI is not configured on the server');
  }

  const { image } = await readMethodBody<{ image?: unknown }>(request);
  if (!(image instanceof File)) {
    return problemResponse(400, 'Send the photo as "image": an uploaded file (multipart)');
  }
  const mimeType = image.type;
  if (!mimeType.startsWith('image/')) {
    return problemResponse(400, 'Invalid file type. Must be an image.');
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const imageBase64 = btoa(binary);

  console.log(`Processing grocery image for user ${auth.user.id}`);

  try {
    const items = await extractGroceryItemsFromImage(imageBase64, mimeType);
    if (items.length === 0) {
      return Response.json({ items: [], message: 'No grocery items found in the image' });
    }
    return Response.json({
      items,
      message: `Extracted ${items.length} items from image`,
    });
  } catch (error) {
    console.error('Failed to extract grocery items from image:', error);
    return problemResponse(
      500,
      error instanceof Error ? error.message : 'Failed to process image. Please try again.',
    );
  }
};

export default handler;
