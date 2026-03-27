/**
 * API Route: Process Grocery List Image
 *
 * POST /api/groceries/process-image
 * Body: { image: string (base64), mimeType: string }
 * Returns: { items: Array<{ name: string }>, message: string }
 *
 * Requires user authentication (PocketBase token in Authorization header)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PocketBase from 'pocketbase';

interface ExtractedItem {
  name: string;
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
 * Extract grocery items from an image using Gemini Vision (without categorization)
 */
async function extractGroceryItemsFromImage(
  imageBase64: string,
  mimeType: string,
  genAI: GoogleGenerativeAI
): Promise<ExtractedItem[]> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    };

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

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text().trim();

    // Parse the response into individual items (without categories)
    const items = text
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && !item.startsWith('*') && !item.startsWith('-'))
      .map((item) => {
        // Remove leading bullets or dashes
        return item.replace(/^[•\-*]\s*/, '').trim();
      })
      .filter((item) => item.length > 0)
      .map((item): ExtractedItem => ({
        name: item,
      }));

    console.log(`Extracted ${items.length} items from image`);
    return items;
  } catch (error) {
    console.error('Failed to extract grocery items from image:', error);
    throw new Error('Failed to extract grocery items from image');
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
      // Extract items from image (without categorization)
      const extractedItems = await extractGroceryItemsFromImage(image, mimeType, genAI);

      if (extractedItems.length === 0) {
        return NextResponse.json({
          items: [],
          message: 'No grocery items found in the image',
        });
      }

      console.log(`Successfully extracted ${extractedItems.length} items`);

      return NextResponse.json({
        items: extractedItems,
        message: `Extracted ${extractedItems.length} items from image`,
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
