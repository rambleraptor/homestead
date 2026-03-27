/**
 * Gemini AI Service
 *
 * Integration with Google's Gemini AI for image processing
 * Uses backend API to keep API key secure
 */

import { logger } from '@/core/utils/logger';
import { pb } from '@/core/api/pocketbase';

/**
 * Convert an image file to base64 string
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
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
 * Extract grocery items from an image using backend Gemini Vision API
 */
export async function extractGroceryItemsFromImage(
  imageFile: File
): Promise<ExtractedGroceryItem[]> {
  try {
    logger.info('Sending image to backend for processing');

    // Convert image to base64
    const base64Image = await fileToBase64(imageFile);

    // Send to backend API
    const token = pb.authStore.token;
    const res = await fetch('/api/groceries/process-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        image: base64Image,
        mimeType: imageFile.type,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const response = await res.json() as {
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
