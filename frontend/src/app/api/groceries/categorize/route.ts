/**
 * API Route: Categorize Single Grocery Item
 *
 * POST /api/groceries/categorize
 * Body: { name: string }
 * Returns: { name: string, category: string }
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
 * Categorize a single grocery item using Gemini AI
 */
async function categorizeGroceryItem(itemName: string, genAI: GoogleGenerativeAI): Promise<GroceryCategory> {
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
      // Fallback to 'Other' if API key not configured
      const data = await request.json();
      return NextResponse.json({
        name: data.name,
        category: 'Other',
        message: 'API key not configured, defaulted to Other',
      });
    }

    // Parse request body
    const data = await request.json();
    if (!data || !data.name) {
      return NextResponse.json(
        {
          error: 'Bad request',
          message: 'Missing required field: name',
        },
        { status: 400 }
      );
    }

    const { name } = data;

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);

    // Categorize the item
    try {
      const category = await categorizeGroceryItem(name, genAI);
      return NextResponse.json({
        name: name,
        category: category,
      });
    } catch (error) {
      console.error('Failed to categorize item:', error);
      return NextResponse.json({
        name: name,
        category: 'Other',
        message: 'Categorization failed, defaulted to Other',
      });
    }
  } catch (error) {
    console.error('Error in categorization endpoint:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
