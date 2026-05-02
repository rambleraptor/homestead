import { describe, it, expect } from 'vitest';
import {
  paprikaImporter,
  paprikaJsonToRecipe,
  type PaprikaRecipeJson,
} from '../importers/paprikaImporter';

const SAMPLE: PaprikaRecipeJson = {
  name: 'Bacon Wrapped Asparagus',
  source: 'wellplated.com',
  source_url: 'https://www.wellplated.com/bacon-wrapped-asparagus/',
  description: '',
  ingredients:
    '1 pound asparagus spears trimmed (about 20 to 24 spears)\n' +
    '1 tablespoon extra-virgin olive oil\n' +
    '1/2 teaspoon black pepper\n' +
    '8 strips thick-cut bacon',
  directions:
    'Place a rack in the center of your oven and preheat the oven to 400 degrees F.\n\n' +
    'Place the asparagus in a large bowl or on the prepared baking sheet.\n\n' +
    'Bake until the bacon is crisp and the asparagus is tender.',
  notes: 'For storage tips, see the blog post above.',
  nutritional_info: 'CALORIES: 177kcal\nCARBOHYDRATES: 3g\nPROTEIN: 6g',
  prep_time: '10 mins',
  cook_time: '25 mins',
  total_time: '',
  servings: 'Servings: 8 bundles',
  difficulty: '',
  categories: ['Sides', 'Vegetables'],
  rating: 0,
};

describe('paprikaJsonToRecipe', () => {
  it('extracts the title and source URL (preferring source_url)', () => {
    const r = paprikaJsonToRecipe(SAMPLE);
    expect(r.title).toBe('Bacon Wrapped Asparagus');
    expect(r.source_pointer).toBe(
      'https://www.wellplated.com/bacon-wrapped-asparagus/',
    );
  });

  it('falls back to source when source_url is missing', () => {
    const r = paprikaJsonToRecipe({ ...SAMPLE, source_url: '' });
    expect(r.source_pointer).toBe('wellplated.com');
  });

  it('parses the ingredient block into structured ingredients', () => {
    const r = paprikaJsonToRecipe(SAMPLE);
    expect(r.parsed_ingredients).toEqual([
      {
        qty: 1,
        unit: 'pound',
        item: 'asparagus spears trimmed (about 20 to 24 spears)',
        raw: '1 pound asparagus spears trimmed (about 20 to 24 spears)',
      },
      {
        qty: 1,
        unit: 'tablespoon',
        item: 'extra-virgin olive oil',
        raw: '1 tablespoon extra-virgin olive oil',
      },
      {
        qty: 0.5,
        unit: 'teaspoon',
        item: 'black pepper',
        raw: '1/2 teaspoon black pepper',
      },
      {
        qty: 8,
        unit: 'strips',
        item: 'thick-cut bacon',
        raw: '8 strips thick-cut bacon',
      },
    ]);
  });

  it('maps prep_time, cook_time, and servings to their dedicated fields', () => {
    const r = paprikaJsonToRecipe(SAMPLE);
    expect(r.prep_time).toBe('10 mins');
    expect(r.cook_time).toBe('25 mins');
    expect(r.servings).toBe('Servings: 8 bundles');
  });

  it('splits directions into steps on paragraph boundaries', () => {
    const r = paprikaJsonToRecipe(SAMPLE);
    expect(r.steps).toEqual([
      'Place a rack in the center of your oven and preheat the oven to 400 degrees F.',
      'Place the asparagus in a large bowl or on the prepared baking sheet.',
      'Bake until the bacon is crisp and the asparagus is tender.',
    ]);
  });

  it('keeps notes, nutrition, and overflow metadata in method markdown', () => {
    const method = paprikaJsonToRecipe(SAMPLE).method ?? '';
    expect(method).not.toContain('## Directions');
    expect(method).not.toContain('Prep Time:');
    expect(method).not.toContain('Cook Time:');
    expect(method).toContain('## Notes');
    expect(method).toContain('For storage tips');
    expect(method).toContain('## Nutrition');
    expect(method).toContain('- CALORIES: 177kcal');
  });

  it('folds Total Time and Difficulty into method when present', () => {
    const method =
      paprikaJsonToRecipe({ ...SAMPLE, total_time: '35 mins', difficulty: 'Easy' })
        .method ?? '';
    expect(method).toContain('Total Time: 35 mins');
    expect(method).toContain('Difficulty: Easy');
  });

  it('propagates categories as tags', () => {
    const r = paprikaJsonToRecipe(SAMPLE);
    expect(r.tags).toEqual(['Sides', 'Vegetables']);
  });

  it('drops tags when categories is empty', () => {
    const r = paprikaJsonToRecipe({ ...SAMPLE, categories: [] });
    expect(r.tags).toBeUndefined();
  });

  it('defaults the title when name is missing', () => {
    const r = paprikaJsonToRecipe({ ...SAMPLE, name: '' });
    expect(r.title).toBe('Untitled Recipe');
  });

  it('returns no method/steps when every source is empty', () => {
    const r = paprikaJsonToRecipe({ name: 'Bare' });
    expect(r.method).toBeUndefined();
    expect(r.steps).toBeUndefined();
    expect(r.prep_time).toBeUndefined();
    expect(r.cook_time).toBeUndefined();
    expect(r.servings).toBeUndefined();
    expect(r.parsed_ingredients).toEqual([]);
    expect(r.source_pointer).toBeUndefined();
  });
});

describe('paprikaImporter', () => {
  it('exposes a stable importer id, label, and accept list', () => {
    expect(paprikaImporter.id).toBe('paprika');
    expect(paprikaImporter.label).toBe('Paprika');
    expect(paprikaImporter.inputType).toBe('file');
    if (paprikaImporter.inputType === 'file') {
      expect(paprikaImporter.accept).toContain('.paprikarecipe');
      expect(paprikaImporter.accept).toContain('.paprikarecipes');
    }
  });

  it('rejects a file that is neither gzip nor zip', async () => {
    if (paprikaImporter.inputType !== 'file') throw new Error('wrong type');
    const file = fileFromBytes(new Uint8Array([1, 2, 3, 4]));
    const result = await paprikaImporter.parseFile(file);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.data).toBeUndefined();
  });

  it('parses a gzipped single-recipe file end-to-end', async () => {
    if (paprikaImporter.inputType !== 'file') throw new Error('wrong type');
    const gzipped = await gzipString(JSON.stringify(SAMPLE));
    const file = fileFromBytes(gzipped);
    const result = await paprikaImporter.parseFile(file);
    expect(result.errors).toEqual([]);
    expect(result.data?.title).toBe('Bacon Wrapped Asparagus');
    expect(result.data?.parsed_ingredients.length).toBe(4);
    expect(result.additional).toBeUndefined();
  });
});

// jsdom's File.arrayBuffer is unreliable, so stub just enough of the shape
// our importer consumes.
function fileFromBytes(bytes: Uint8Array): File {
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  return { arrayBuffer: async () => buf } as unknown as File;
}

async function gzipString(text: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
