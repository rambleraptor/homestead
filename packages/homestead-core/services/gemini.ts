/**
 * Gemini AI Service
 *
 * Integration with Google's Gemini AI for image processing. Uses backend
 * API to keep the API key secure.
 */

import { logger } from '../utils/logger';
import { aepbase } from '../api/aepbase';

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

export async function extractGroceryItemsFromImage(
  imageFile: File,
): Promise<ExtractedGroceryItem[]> {
  try {
    logger.info('Sending image to backend for processing');
    const base64Image = await fileToBase64(imageFile);
    const token = aepbase.authStore.token;
    const userId = aepbase.getCurrentUser()?.id || '';

    const res = await fetch('/api/groceries/process-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-User-Id': userId,
      },
      body: JSON.stringify({ image: base64Image, mimeType: imageFile.type }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const response = (await res.json()) as {
      items: ExtractedGroceryItem[];
      message: string;
    };
    logger.info(response.message);
    return response.items;
  } catch (error) {
    logger.error('Failed to extract grocery items from image', error);
    throw new Error('Failed to extract grocery items from image. Please try again.');
  }
}
