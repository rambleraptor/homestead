/**
 * API Route: Import Recipe from URL
 *
 * POST /api/recipes/import-from-url
 * Body: { url: string }
 * Returns: { title, ingredients, instructions, source_reference }
 *
 * Fetches a recipe URL, extracts the HTML content, and uses Gemini AI
 * to parse structured recipe data from it.
 *
 * Requires user authentication (PocketBase token in Authorization header)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PocketBase from 'pocketbase';

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

    if (!pb.authStore.isValid) {
      return null;
    }

    await pb.collection('users').authRefresh();
    return pb.authStore.model;
  } catch (error) {
    console.error('Auth verification failed:', error);
    return null;
  }
}

/**
 * Fetch and extract text content from a URL
 */
async function fetchPageContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HomeOS/1.0; Recipe Importer)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Trim to a reasonable size for AI processing (keep first ~100k chars)
  return html.slice(0, 100_000);
}

interface ParsedIngredient {
  item: string;
  amount: number;
  unit: string;
  note?: string;
}

interface ParsedRecipe {
  title: string;
  ingredients: ParsedIngredient[];
  instructions: string;
}

/**
 * Use Gemini AI to extract structured recipe data from HTML content
 */
async function extractRecipeFromHtml(
  html: string,
  url: string,
  genAI: GoogleGenerativeAI
): Promise<ParsedRecipe> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `You are a recipe extraction expert. Extract structured recipe data from this webpage HTML.

URL: ${url}

HTML Content:
${html}

Extract the recipe and return ONLY valid JSON (no markdown fences, no extra text) in this exact format:
{
  "title": "Recipe Title",
  "ingredients": [
    {
      "item": "ingredient name (e.g., flour, chicken breast)",
      "amount": 1.5,
      "unit": "cups",
      "note": "optional preparation note like sifted, diced, etc."
    }
  ],
  "instructions": "Step-by-step cooking instructions as a single string. Use numbered steps separated by newlines."
}

Rules:
- "amount" must be a number (convert fractions: 1/2 = 0.5, 1/4 = 0.25, 1/3 = 0.33, 2/3 = 0.67, 3/4 = 0.75)
- "unit" should be a standard unit (cup, tbsp, tsp, oz, lb, g, kg, ml, L, piece, clove, slice, whole, pinch, dash, to taste). Use empty string "" if no unit.
- "note" is optional - only include it for preparation details (diced, minced, melted, room temperature, etc.)
- "item" should be the ingredient name only, without amounts or preparation notes
- "instructions" should be clear numbered steps, each on its own line
- If you cannot find a recipe on the page, return: {"title": "", "ingredients": [], "instructions": ""}

Return ONLY the JSON object:`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text().trim();

  // Strip markdown code fences if present
  const jsonStr = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');

  const parsed = JSON.parse(jsonStr);

  if (!parsed.title) {
    throw new Error('Could not extract a recipe from this page');
  }

  return {
    title: parsed.title,
    ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
    instructions: typeof parsed.instructions === 'string' ? parsed.instructions : '',
  };
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
        { error: 'Recipe import is not available - AI API key not configured' },
        { status: 503 }
      );
    }

    // Parse request body
    const data = await request.json();
    if (!data || !data.url) {
      return NextResponse.json(
        { error: 'Missing required field: url' },
        { status: 400 }
      );
    }

    const { url } = data;

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Fetch the page content
    let html: string;
    try {
      html = await fetchPageContent(url);
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Failed to fetch the URL',
          message: error instanceof Error ? error.message : 'Could not retrieve the page',
        },
        { status: 422 }
      );
    }

    // Extract recipe using AI
    const genAI = new GoogleGenerativeAI(apiKey);

    try {
      const recipe = await extractRecipeFromHtml(html, url, genAI);
      return NextResponse.json({
        title: recipe.title,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        source_reference: url,
      });
    } catch (error) {
      console.error('Failed to extract recipe:', error);
      return NextResponse.json(
        {
          error: 'Failed to extract recipe from page',
          message: error instanceof Error ? error.message : 'Could not parse recipe data',
        },
        { status: 422 }
      );
    }
  } catch (error) {
    console.error('Error in recipe import endpoint:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
