/**
 * API Route: Process Grocery List Image
 *
 * POST /api/groceries/process-image
 * Body: { image: string (base64), mimeType: string }
 * Returns: { items: Array<{ name: string, category: string }>, message: string }
 *
 * Requires user authentication (PocketBase token in Authorization header)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PocketBase from 'pocketbase';

// Standard grocery store categories
const GROCERY_CATEGORIES = [
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

type GroceryCategory = typeof GROCERY_CATEGORIES[number];

interface ExtractedItem {
  name: string;
  category: GroceryCategory;
}

/**
 * Verify authentication using PocketBase token
 */
async function verifyAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090');

  try {
    pb.authStore.save(token);
    // Verify the token is valid
    if (!pb.authStore.isValid) {
      return null;
    }
    return pb.authStore.model;
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

/**
 * Extract grocery items from an image using Gemini Vision
 */
async function extractGroceryItemsFromImage(
  imageBase64: string,
  mimeType: string,
  genAI: GoogleGenerativeAI
): Promise<string[]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    };

    const prompt = `You are a grocery list reader. Analyze this image of a handwritten or printed grocery list and extract all the grocery items.

Rules:
- Extract ONLY the grocery item names
- Return one item per line
- Ignore quantities, checkmarks, or other annotations
- If an item is crossed out or checked, still include it
- Clean up any messy handwriting to readable item names
- Do not include any other text, explanations, or formatting
- If the image doesn't contain a grocery list, return an empty response

Example output format:
Milk
Bread
Eggs
Chicken breast
Lettuce`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text().trim();

    // Parse the response into individual items
    const items = text
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && !item.startsWith('*') && !item.startsWith('-'))
      .map((item) => {
        // Remove leading bullets or dashes
        return item.replace(/^[•\-*]\s*/, '').trim();
      })
      .filter((item) => item.length > 0);

    console.log(`Extracted ${items.length} items from image`);
    return items;
  } catch (error) {
    console.error('Failed to extract grocery items from image:', error);
    throw new Error('Failed to extract grocery items from image');
  }
}

/**
 * Categorize a single grocery item using Gemini AI
 */
async function categorizeGroceryItem(
  itemName: string,
  genAI: GoogleGenerativeAI
): Promise<GroceryCategory> {
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
      return category as GroceryCategory;
    }

    // If invalid response, default to 'Other'
    console.warn(`Invalid category "${category}" returned for "${itemName}", defaulting to "Other"`);
    return 'Other';
  } catch (error) {
    console.error('Failed to categorize grocery item:', error);
    return 'Other';
  }
}

/**
 * Batch categorize grocery items with rate limiting
 */
async function categorizeGroceryItems(
  items: string[],
  genAI: GoogleGenerativeAI
): Promise<ExtractedItem[]> {
  const BATCH_SIZE = 5; // Process 5 items at a time to avoid rate limits
  const results: ExtractedItem[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const categorizations = await Promise.all(
      batch.map(async (item) => {
        const category = await categorizeGroceryItem(item, genAI);
        return { name: item, category };
      })
    );
    results.push(...categorizations);
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    // Verify user authentication
    const authRecord = await verifyAuth(request);
    if (!authRecord) {
      return NextResponse.json(
        { error: 'Unauthorized - authentication required' },
        { status: 401 }
      );
    }

    // Check API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'Service unavailable',
          message: 'Gemini API is not configured on the server',
        },
        { status: 503 }
      );
    }

    // Parse request body
    const data = await request.json();
    if (!data || !data.image || !data.mimeType) {
      return NextResponse.json(
        {
          error: 'Bad request',
          message: 'Missing required fields: image, mimeType',
        },
        { status: 400 }
      );
    }

    const { image, mimeType } = data;

    // Validate mime type
    if (!mimeType.startsWith('image/')) {
      return NextResponse.json(
        {
          error: 'Bad request',
          message: 'Invalid file type. Must be an image.',
        },
        { status: 400 }
      );
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);

    console.log(`Processing grocery image for user ${authRecord.id}`);

    try {
      // Step 1: Extract items from image
      const extractedItems = await extractGroceryItemsFromImage(image, mimeType, genAI);

      if (extractedItems.length === 0) {
        return NextResponse.json({
          items: [],
          message: 'No grocery items found in the image',
        });
      }

      // Step 2: Categorize all items
      const categorizedItems = await categorizeGroceryItems(extractedItems, genAI);

      console.log(`Successfully processed ${categorizedItems.length} items`);

      return NextResponse.json({
        items: categorizedItems,
        message: `Extracted ${categorizedItems.length} items from image`,
      });
    } catch (error) {
      console.error('Error processing image:', error);
      return NextResponse.json(
        {
          error: 'Processing failed',
          message: error instanceof Error ? error.message : 'Failed to process image. Please try again.',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in grocery image processor endpoint:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
