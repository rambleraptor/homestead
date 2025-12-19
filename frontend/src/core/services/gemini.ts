/**
 * Gemini AI Service
 *
 * Integration with Google's Gemini AI for intelligent categorization
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/core/utils/logger';

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

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

let genAI: GoogleGenerativeAI | null = null;

/**
 * Initialize Gemini AI client
 */
function initializeGemini(): GoogleGenerativeAI | null {
  if (!API_KEY) {
    logger.warn('Gemini API key not configured. AI categorization will be disabled.');
    return null;
  }

  try {
    return new GoogleGenerativeAI(API_KEY);
  } catch (error) {
    logger.error('Failed to initialize Gemini AI', error);
    return null;
  }
}

/**
 * Categorize a grocery item using Gemini AI
 */
export async function categorizeGroceryItem(itemName: string): Promise<GroceryCategory> {
  // Initialize on first use
  if (genAI === null) {
    genAI = initializeGemini();
  }

  // Fallback to 'Other' if AI is not available
  if (!genAI) {
    logger.warn('Gemini AI not available, defaulting to "Other" category');
    return 'Other';
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `You are a grocery store categorization assistant. Given a grocery item name, categorize it into one of these categories:

${GROCERY_CATEGORIES.join(', ')}

Item: "${itemName}"

Rules:
- Respond with ONLY the category name, nothing else
- Choose the most specific and accurate category
- If unsure, choose "Other"

Category:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const category = response.text().trim();

    // Validate the response is a valid category
    if (GROCERY_CATEGORIES.includes(category as GroceryCategory)) {
      logger.debug(`Categorized "${itemName}" as "${category}"`);
      return category as GroceryCategory;
    }

    // If invalid response, default to 'Other'
    logger.warn(`Invalid category "${category}" returned for "${itemName}", defaulting to "Other"`);
    return 'Other';
  } catch (error) {
    logger.error('Failed to categorize grocery item with Gemini', error);
    return 'Other';
  }
}

/**
 * Batch categorize multiple grocery items
 */
export async function categorizeGroceryItems(
  items: string[]
): Promise<Map<string, GroceryCategory>> {
  const results = new Map<string, GroceryCategory>();

  // Process items in parallel with rate limiting
  const categorizations = await Promise.all(
    items.map(async (item) => {
      const category = await categorizeGroceryItem(item);
      return { item, category };
    })
  );

  categorizations.forEach(({ item, category }) => {
    results.set(item, category);
  });

  return results;
}
