/**
 * Gemini AI Service
 *
 * Integration with Google's Gemini AI for intelligent categorization
 * Now uses backend API to keep API key secure
 */

import { logger } from '@/core/utils/logger';
import { pb } from '@/core/api/pocketbase';

// Standard grocery store categories
export const GROCERY_CATEGORIES = [
  'Produce',
  'Dairy & Eggs',
  'Meat & Seafood',
  'Bakery',
  'Frozen Foods',
  'Pantry & Canned Goods',
  'Snacks & Candy',
  'Beverages',
  'Health & Beauty',
  'Household & Cleaning',
  'Other',
] as const;

export type GroceryCategory = typeof GROCERY_CATEGORIES[number];

/**
 * Categorize a grocery item using backend Gemini API
 */
export async function categorizeGroceryItem(itemName: string): Promise<GroceryCategory> {
  try {
    const token = pb.authStore.token;
    const res = await fetch('/api/groceries/categorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ name: itemName }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const response = await res.json() as { name: string; category: GroceryCategory; message?: string };

    if (response.message) {
      logger.warn(response.message);
    }

    logger.debug(`Categorized "${itemName}" as "${response.category}"`);
    return response.category;
  } catch (error) {
    logger.error('Failed to categorize grocery item', error);
    return 'Other';
  }
}

/**
 * Batch categorize multiple grocery items
 * Items are processed in batches by the backend
 */
export async function categorizeGroceryItems(
  items: string[]
): Promise<Map<string, GroceryCategory>> {
  const results = new Map<string, GroceryCategory>();

  // Backend handles rate limiting, but we'll still process in reasonable batches
  const BATCH_SIZE = 10;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const categorizations = await Promise.all(
      batch.map(async (item) => {
        const category = await categorizeGroceryItem(item);
        return { item, category };
      })
    );

    categorizations.forEach(({ item, category }) => {
      results.set(item, category);
    });
  }

  return results;
}

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
  category: GroceryCategory;
}

/**
 * Extract and categorize grocery items from an image using backend Gemini Vision API
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
