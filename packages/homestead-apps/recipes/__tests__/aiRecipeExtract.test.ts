import { describe, expect, it } from 'vitest';
import { extractionToResult, type RecipeExtraction } from '../methods/ai-recipe-extract';
import { sniffImageType } from '../methods/bulk-import-screenshots';

const base: RecipeExtraction['recipes'][number] = {
  title: 'Fried Rice',
  ingredients: [
    { line: '2 cups rice', group: null },
    { line: '  ', group: null },
    { line: '1 tbsp soy sauce (or tamari)', group: 'Sauce' },
  ],
  steps: ['Cook.', ' '],
  prep_time: '5 mins',
  cook_time: null,
  servings: ' ',
  tags: ['Dinner'],
  notes: 'Use day-old rice.',
};

describe('extractionToResult', () => {
  it('maps a recipe through the ingredient parser and drops blanks', () => {
    const result = extractionToResult(
      { recipes: [base], problem: null },
      { sourceUrl: 'https://www.tiktok.com/@a/video/1', noRecipeMessage: 'none' },
    );

    expect(result.errors).toEqual([]);
    expect(result.data).toMatchObject({
      title: 'Fried Rice',
      source_pointer: 'https://www.tiktok.com/@a/video/1',
      steps: ['Cook.'],
      prep_time: '5 mins',
      tags: ['Dinner'],
      method: '## Notes\n\nUse day-old rice.',
    });
    expect(result.data).not.toHaveProperty('cook_time');
    expect(result.data).not.toHaveProperty('servings');
    expect(result.data?.parsed_ingredients).toEqual([
      { qty: 2, unit: 'cups', item: 'rice', raw: '2 cups rice' },
      expect.objectContaining({ unit: 'tbsp', item: 'soy sauce', group: 'Sauce' }),
    ]);
    expect(result.warnings[0]).toMatch(/check the quantities/);
  });

  it('returns extra recipes as `additional`', () => {
    const result = extractionToResult(
      { recipes: [base, { ...base, title: 'Pancakes' }], problem: null },
      { noRecipeMessage: 'none' },
    );
    expect(result.data?.title).toBe('Fried Rice');
    expect(result.additional?.map((r) => r.title)).toEqual(['Pancakes']);
  });

  it("reports the model's reason when there is no recipe", () => {
    const result = extractionToResult(
      { recipes: [], problem: 'The caption says "recipe in bio".' },
      { noRecipeMessage: "The post's caption doesn't include the recipe." },
    );
    expect(result.data).toBeUndefined();
    expect(result.errors).toEqual([
      'The post\'s caption doesn\'t include the recipe. The caption says "recipe in bio".',
    ]);
  });

  it('treats a recipe with no ingredients or steps as no recipe', () => {
    const result = extractionToResult(
      { recipes: [{ ...base, ingredients: [], steps: [] }], problem: null },
      { noRecipeMessage: 'Nothing here.' },
    );
    expect(result.errors).toEqual(['Nothing here.']);
  });
});

describe('sniffImageType', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);

  it('recognizes the accepted image types', () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImageType(new TextEncoder().encode('GIF89a'))).toBe('image/gif');
    expect(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('rejects anything else', () => {
    expect(sniffImageType(new TextEncoder().encode('hello'))).toBeUndefined();
    expect(sniffImageType(new TextEncoder().encode('RIFF\0\0\0\0WAVE'))).toBeUndefined();
    expect(sniffImageType(bytes())).toBeUndefined();
  });
});
