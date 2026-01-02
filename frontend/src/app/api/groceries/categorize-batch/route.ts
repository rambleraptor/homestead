/**
 * API Route: Batch Categorize Grocery Items
 *
 * POST /api/groceries/categorize-batch
 * Body: { items: Array<{ id: string, name: string }> }
 * Returns: { categorized: Array<{ id: string, category: string }>, failed: string[] }
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

interface ItemToCategorize {
  id: string;
  name: string;
}

interface CategorizedItem {
  id: string;
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
    // Load the token into authStore
    pb.authStore.save(token);

    // Verify the token is structurally valid and not expired
    if (!pb.authStore.isValid) {
      return null;
    }

    // Actually verify the token by making an authenticated request
    // This will throw if the token is invalid
    await pb.collection('users').authRefresh();

    return pb.authStore.model;
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

/**
 * Categorize multiple grocery items using a single Gemini AI call
 * This is more efficient than individual calls
 */
async function batchCategorizeGroceryItems(
  items: ItemToCategorize[],
  genAI: GoogleGenerativeAI
): Promise<CategorizedItem[]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Create a more detailed prompt with examples to improve categorization accuracy
    const prompt = `You are a grocery store categorization expert. Categorize each grocery item into the most appropriate category.

Available categories:
${GROCERY_CATEGORIES.map((cat, idx) => `${idx + 1}. ${cat}`).join('\n')}

Category Guidelines:
- **Produce**: Fresh fruits, vegetables, herbs, salads
  Examples: apples, bananas, lettuce, tomatoes, carrots, onions, fresh herbs
- **Dairy & Eggs**: Milk, cheese, yogurt, butter, eggs, cream
  Examples: milk, cheddar cheese, yogurt, eggs, butter, sour cream
- **Meat & Seafood**: Fresh and frozen meat, poultry, fish, deli meats
  Examples: chicken breast, ground beef, salmon, bacon, deli turkey
- **Bakery**: Bread, rolls, pastries, fresh baked goods
  Examples: bread, bagels, croissants, donuts, muffins
- **Frozen Foods**: Frozen meals, vegetables, desserts, pizza
  Examples: frozen pizza, ice cream, frozen vegetables, TV dinners
- **Pantry & Canned Goods**: Shelf-stable items, canned goods, pasta, rice, cereals, condiments
  Examples: pasta, rice, canned beans, cereal, peanut butter, olive oil, ketchup
- **Snacks & Candy**: Chips, crackers, cookies, candy, nuts
  Examples: potato chips, cookies, chocolate, popcorn, granola bars
- **Beverages**: Non-dairy drinks (soda, juice, coffee, tea, water)
  Examples: soda, orange juice, coffee, tea bags, bottled water
- **Health & Beauty**: Personal care, medications, vitamins, cosmetics
  Examples: shampoo, toothpaste, vitamins, pain relievers, lotion
- **Household & Cleaning**: Cleaning supplies, paper products, laundry
  Examples: dish soap, paper towels, laundry detergent, trash bags
- **Other**: Items that don't fit other categories

Items to categorize:
${items.map((item, idx) => `${idx + 1}. ${item.name}`).join('\n')}

Instructions:
- Respond with ONLY the category name for each item, one per line
- Match the order of items exactly (line 1 = item 1, line 2 = item 2, etc.)
- Choose the MOST SPECIFIC category that fits
- Consider the primary use/location in a grocery store
- For items with quantities (e.g., "2 gallons milk"), focus on the item name
- Use exactly these category names: ${GROCERY_CATEGORIES.join(', ')}

Response format (one category per line):`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    // Parse the response - one category per line
    const categories = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const categorized: CategorizedItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let category: GroceryCategory = 'Other';

      // Get the corresponding category from the response
      if (i < categories.length) {
        const responseCategory = categories[i].trim();
        // Validate the response is a valid category
        if (GROCERY_CATEGORIES.includes(responseCategory as GroceryCategory)) {
          category = responseCategory as GroceryCategory;
        } else {
          console.warn(`Invalid category "${responseCategory}" for "${item.name}", using "Other"`);
        }
      } else {
        console.warn(`No category returned for "${item.name}", using "Other"`);
      }

      categorized.push({
        id: item.id,
        category,
      });
    }

    return categorized;
  } catch (error) {
    console.error('Failed to batch categorize grocery items:', error);
    throw error;
  }
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
    if (!data || !Array.isArray(data.items)) {
      return NextResponse.json(
        {
          error: 'Bad request',
          message: 'Missing or invalid required field: items (must be an array)',
        },
        { status: 400 }
      );
    }

    const { items } = data as { items: ItemToCategorize[] };

    if (items.length === 0) {
      return NextResponse.json({
        categorized: [],
        failed: [],
        message: 'No items to categorize',
      });
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);

    console.log(`Batch categorizing ${items.length} items for user ${authRecord.id}`);

    try {
      // Process items in batches to avoid rate limits and token limits
      const BATCH_SIZE = 20; // Process 20 items at a time
      const categorized: CategorizedItem[] = [];
      const failed: string[] = [];

      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        try {
          const batchResult = await batchCategorizeGroceryItems(batch, genAI);
          categorized.push(...batchResult);
        } catch (error) {
          console.error(`Failed to categorize batch starting at index ${i}:`, error);
          // Add failed items to the failed list
          batch.forEach((item) => failed.push(item.id));
        }
      }

      console.log(`Successfully categorized ${categorized.length} of ${items.length} items`);

      return NextResponse.json({
        categorized,
        failed,
        message: `Categorized ${categorized.length} of ${items.length} items`,
      });
    } catch (error) {
      console.error('Error in batch categorization:', error);
      return NextResponse.json(
        {
          error: 'Categorization failed',
          message: error instanceof Error ? error.message : 'Failed to categorize items. Please try again.',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in batch categorization endpoint:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
