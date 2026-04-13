/**
 * POST /api/hsa/parse-receipt
 * Body: { image: string (base64), mimeType: string }
 * Returns: { data: {...}, message: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { authenticate } from '../../_lib/aepbase-server';

interface ParsedReceiptData {
  merchant: string;
  service_date: string;
  amount: number;
  category: 'Medical' | 'Dental' | 'Vision' | 'Rx';
  patient?: string;
}

async function parseReceiptFromImage(
  imageBase64: string,
  mimeType: string,
  genAI: GoogleGenerativeAI,
): Promise<ParsedReceiptData> {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const imagePart = { inlineData: { data: imageBase64, mimeType } };
    const prompt = `You are a medical receipt parser. Analyze this receipt image and extract the following information:

1. Merchant/Provider name (e.g., "CVS Pharmacy", "Dr. Smith's Office", "ABC Dental")
2. Service date (in YYYY-MM-DD format)
3. Total amount paid (as a number, do not include currency symbols)
4. Category (one of: Medical, Dental, Vision, Rx)
5. Patient name (if visible, otherwise leave empty)

Rules:
- Return ONLY a valid JSON object with these exact keys: merchant, service_date, amount, category, patient
- For service_date, use YYYY-MM-DD format (e.g., "2024-01-15")
- For amount, return only the number without $ or currency symbols (e.g., 125.50)
- For category, return EXACTLY one of: Medical, Dental, Vision, Rx
- If the image is not a medical receipt, return an empty JSON object: {}
- If a field cannot be determined, use these defaults:
  - merchant: "Unknown Provider"
  - service_date: today's date
  - amount: 0
  - category: "Medical"
  - patient: "" (empty string)`;

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text().trim();

    let jsonText = text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonText = jsonMatch[0];
    const parsed = JSON.parse(jsonText);

    if (!parsed || Object.keys(parsed).length === 0) {
      throw new Error('No receipt data found in image');
    }

    return {
      merchant: parsed.merchant || 'Unknown Provider',
      service_date: parsed.service_date || new Date().toISOString().split('T')[0],
      amount: typeof parsed.amount === 'number' ? parsed.amount : 0,
      category: ['Medical', 'Dental', 'Vision', 'Rx'].includes(parsed.category)
        ? parsed.category
        : 'Medical',
      patient: parsed.patient || '',
    };
  } catch (error) {
    console.error('Failed to parse receipt from image:', error);
    throw new Error('Failed to parse receipt from image');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized - authentication required' },
        { status: 401 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Service unavailable', message: 'Gemini API is not configured on the server' },
        { status: 503 },
      );
    }

    const data = await request.json();
    if (!data || !data.image || !data.mimeType) {
      return NextResponse.json(
        { error: 'Bad request', message: 'Missing required fields: image, mimeType' },
        { status: 400 },
      );
    }

    const { image, mimeType } = data;
    if (!mimeType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Bad request', message: 'Invalid file type. Must be an image.' },
        { status: 400 },
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    console.log(`Parsing receipt image for user ${auth.user.id}`);

    try {
      const receiptData = await parseReceiptFromImage(image, mimeType, genAI);
      return NextResponse.json({ data: receiptData, message: 'Receipt parsed successfully' });
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Parsing failed',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to parse receipt. Please try again.',
        },
        { status: 500 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
