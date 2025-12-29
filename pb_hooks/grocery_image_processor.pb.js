/// <reference path="../pb_data/types.d.ts" />

/**
 * PocketBase Hook: Grocery Image Processor
 *
 * Provides a secure backend endpoint for processing grocery list images
 * using Google Gemini Vision API. Keeps the API key secure on the server.
 *
 * Environment variables required:
 * - GEMINI_API_KEY: Your Google Gemini API key
 *
 * Dependencies required:
 * - @google/generative-ai: npm install @google/generative-ai
 */

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
];

/**
 * Extract grocery items from an image using Gemini Vision
 */
async function extractGroceryItemsFromImage(imageBase64, mimeType, genAI) {
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
      .map(item => item.trim())
      .filter(item => item.length > 0 && !item.startsWith('*') && !item.startsWith('-'))
      .map(item => {
        // Remove leading bullets or dashes
        return item.replace(/^[•\-*]\s*/, '').trim();
      })
      .filter(item => item.length > 0);

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
async function categorizeGroceryItem(itemName, genAI) {
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
    if (GROCERY_CATEGORIES.includes(category)) {
      return category;
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
async function categorizeGroceryItems(items, genAI) {
  const BATCH_SIZE = 5; // Process 5 items at a time to avoid rate limits
  const results = [];

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

/**
 * Initialize Gemini API on bootstrap
 */
onBootstrap((e) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('⚠️  GEMINI_API_KEY not configured - grocery image upload will not work');
      console.warn('   Set GEMINI_API_KEY environment variable to enable this feature');
      return;
    }

    // Check if @google/generative-ai is available
    try {
      require('@google/generative-ai');
      console.log('✅ Grocery image processor initialized');
    } catch (error) {
      console.error('❌ @google/generative-ai module not found!');
      console.error('   Install with: cd pocketbase && npm install @google/generative-ai');
    }
  } catch (error) {
    console.error('❌ Error initializing grocery image processor:', error);
  } finally {
    e.next();
  }
});

/**
 * API Endpoint: Categorize Single Grocery Item
 *
 * POST /api/groceries/categorize
 * Body: { name: string }
 * Returns: { name: string, category: string }
 *
 * Requires user authentication
 */
routerAdd('POST', '/api/groceries/categorize', (c) => {
  try {
    // Verify user authentication
    const authRecord = c.auth;
    if (!authRecord) {
      return c.json(401, { error: 'Unauthorized - authentication required' });
    }

    // Check API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Fallback to 'Other' if API key not configured
      const data = c.bind({});
      return c.json(200, {
        name: data.name,
        category: 'Other',
        message: 'API key not configured, defaulted to Other',
      });
    }

    // Load Gemini library
    let GoogleGenerativeAI;
    try {
      const module = require('@google/generative-ai');
      GoogleGenerativeAI = module.GoogleGenerativeAI;
    } catch (error) {
      const data = c.bind({});
      return c.json(200, {
        name: data.name,
        category: 'Other',
        message: 'Gemini not available, defaulted to Other',
      });
    }

    // Parse request body
    const data = c.bind({});
    if (!data || !data.name) {
      return c.json(400, {
        error: 'Bad request',
        message: 'Missing required field: name',
      });
    }

    const { name } = data;

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);

    // Categorize the item
    categorizeGroceryItem(name, genAI)
      .then((category) => {
        c.json(200, {
          name: name,
          category: category,
        });
      })
      .catch((error) => {
        console.error('Failed to categorize item:', error);
        c.json(200, {
          name: name,
          category: 'Other',
          message: 'Categorization failed, defaulted to Other',
        });
      });

  } catch (error) {
    console.error('Error in categorization endpoint:', error);
    const data = c.bind({});
    return c.json(200, {
      name: data.name,
      category: 'Other',
      message: 'Error occurred, defaulted to Other',
    });
  }
}, $apis.requireAuth());

/**
 * API Endpoint: Process Grocery List Image
 *
 * POST /api/groceries/process-image
 * Body: { image: string (base64), mimeType: string }
 * Returns: { items: Array<{ name: string, category: string }> }
 *
 * Requires user authentication
 */
routerAdd('POST', '/api/groceries/process-image', (c) => {
  try {
    // Verify user authentication
    const authRecord = c.auth;
    if (!authRecord) {
      return c.json(401, { error: 'Unauthorized - authentication required' });
    }

    // Check API key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return c.json(503, {
        error: 'Service unavailable',
        message: 'Gemini API is not configured on the server',
      });
    }

    // Load Gemini library
    let GoogleGenerativeAI;
    try {
      const module = require('@google/generative-ai');
      GoogleGenerativeAI = module.GoogleGenerativeAI;
    } catch (error) {
      console.error('Failed to load @google/generative-ai:', error);
      return c.json(503, {
        error: 'Service unavailable',
        message: '@google/generative-ai module not installed',
      });
    }

    // Parse request body
    const data = c.bind({});
    if (!data || !data.image || !data.mimeType) {
      return c.json(400, {
        error: 'Bad request',
        message: 'Missing required fields: image, mimeType',
      });
    }

    const { image, mimeType } = data;

    // Validate mime type
    if (!mimeType.startsWith('image/')) {
      return c.json(400, {
        error: 'Bad request',
        message: 'Invalid file type. Must be an image.',
      });
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);

    console.log(`Processing grocery image for user ${authRecord.id}`);

    // Process the image (async operations)
    const processImage = async () => {
      try {
        // Step 1: Extract items from image
        const extractedItems = await extractGroceryItemsFromImage(image, mimeType, genAI);

        if (extractedItems.length === 0) {
          return {
            items: [],
            message: 'No grocery items found in the image',
          };
        }

        // Step 2: Categorize all items
        const categorizedItems = await categorizeGroceryItems(extractedItems, genAI);

        console.log(`Successfully processed ${categorizedItems.length} items`);

        return {
          items: categorizedItems,
          message: `Extracted ${categorizedItems.length} items from image`,
        };
      } catch (error) {
        console.error('Error processing image:', error);
        throw error;
      }
    };

    // Execute async processing
    processImage()
      .then((result) => {
        c.json(200, result);
      })
      .catch((error) => {
        console.error('Failed to process grocery image:', error);
        c.json(500, {
          error: 'Processing failed',
          message: error.message || 'Failed to process image. Please try again.',
        });
      });

    // Note: We can't use async/await in routerAdd directly,
    // so we handle the promise manually

  } catch (error) {
    console.error('Error in grocery image processor endpoint:', error);
    return c.json(500, {
      error: 'Internal server error',
      message: error.message,
    });
  }
}, $apis.requireAuth());
