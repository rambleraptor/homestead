import { describe, expect, it } from 'vitest';
import type { RecipeObject } from 'recipe-scrapers';
import { formatMinutes, importRecipeFromHtml, mapIngredients } from '../importers/urlImporter';

/** Wrap a schema.org Recipe node in a page, the way a blog's JSON-LD arrives. */
function page(recipe: Record<string, unknown>, wrapInGraph = false): string {
  const node = { '@type': 'Recipe', ...recipe };
  const ld = wrapInGraph
    ? { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite', name: 'Blog' }, node] }
    : { '@context': 'https://schema.org', ...node };
  return `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify(
    ld,
  )}</script></head><body></body></html>`;
}

const FULL = {
  name: 'Bacon Wrapped Asparagus',
  author: { '@type': 'Person', name: 'Jane Cook' },
  description: 'Crispy bacon, tender asparagus.',
  image: ['https://img.example.com/asp.jpg'],
  prepTime: 'PT10M',
  cookTime: 'PT25M',
  recipeYield: '4 servings',
  recipeCategory: ['Appetizer'],
  recipeCuisine: ['American'],
  keywords: 'bacon, asparagus, easy',
  recipeIngredient: [
    '1 pound asparagus, trimmed',
    '8 slices bacon (thick cut)',
    '1-2 cloves garlic, minced',
  ],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Preheat the oven to 400F.' }],
  nutrition: { '@type': 'NutritionInformation', calories: '177 kcal' },
};

const URL = 'https://not-a-supported-host.example/recipes/asparagus';

describe('formatMinutes', () => {
  it.each([
    [null, undefined],
    [undefined, undefined],
    [0, undefined],
    [1, '1 min'],
    [25, '25 mins'],
    [60, '1 hr'],
    [90, '1 hr 30 mins'],
    [125, '2 hrs 5 mins'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatMinutes(input as number | null | undefined)).toBe(expected);
  });
});

describe('importRecipeFromHtml', () => {
  it('maps a complete schema.org recipe', async () => {
    const result = await importRecipeFromHtml(page(FULL), URL);

    expect(result.errors).toEqual([]);
    const data = result.data!;
    expect(data.title).toBe('Bacon Wrapped Asparagus');
    expect(data.prep_time).toBe('10 mins');
    expect(data.cook_time).toBe('25 mins');
    expect(data.servings).toBe('4 servings');
    expect(data.source_pointer).toBe(URL);
    expect(data.steps).toEqual(['Preheat the oven to 400F.']);
  });

  it('reads a recipe nested in an @graph', async () => {
    const result = await importRecipeFromHtml(page(FULL, true), URL);
    expect(result.errors).toEqual([]);
    expect(result.data?.title).toBe('Bacon Wrapped Asparagus');
  });

  it('parses ingredients with the app parser, keeping units and notes', async () => {
    const { data } = await importRecipeFromHtml(page(FULL), URL);
    const ingredients = data!.parsed_ingredients;

    expect(ingredients[0]).toMatchObject({
      qty: 1,
      unit: 'pound',
      item: 'asparagus, trimmed',
    });

    // The library's own parser reports no unit here and folds "slices" into the
    // name; ours knows it, which is the reason we keep parseIngredientLine.
    expect(ingredients[1]).toMatchObject({ qty: 8, unit: 'slices', item: 'bacon' });
    expect(ingredients[1].notes).toBe('thick cut');

    // Range: qty takes the low end, the high end is preserved as a note.
    expect(ingredients[2]).toMatchObject({ qty: 1, unit: 'cloves' });
    expect(ingredients[2].notes).toContain('up to 2');
  });

  it('always keeps the raw ingredient line', async () => {
    const { data } = await importRecipeFromHtml(page(FULL), URL);
    expect(data!.parsed_ingredients.map((i) => i.raw)).toEqual(FULL.recipeIngredient);
  });

  it('merges category, cuisine and keywords into tags without duplicates', async () => {
    const { data } = await importRecipeFromHtml(
      page({ ...FULL, keywords: 'bacon, Appetizer' }),
      URL,
    );
    const tags = data!.tags!;
    expect(tags).toContain('Appetizer');
    expect(tags).toContain('American');
    expect(tags).toContain('bacon');
    expect(tags.filter((t) => t.toLowerCase() === 'appetizer')).toHaveLength(1);
  });

  it('puts the description and nutrition into the method body', async () => {
    const { data } = await importRecipeFromHtml(page(FULL), URL);
    expect(data!.method).toContain('Crispy bacon, tender asparagus.');
    expect(data!.method).toContain('## Nutrition');
    expect(data!.method).toContain('177 kcal');
  });

  it('flattens HowToSection groups into steps with headings', async () => {
    const { data } = await importRecipeFromHtml(
      page({
        ...FULL,
        recipeInstructions: [
          {
            '@type': 'HowToSection',
            name: 'Prep',
            itemListElement: [{ '@type': 'HowToStep', text: 'Trim the asparagus.' }],
          },
          {
            '@type': 'HowToSection',
            name: 'Cook',
            itemListElement: [
              { '@type': 'HowToStep', text: 'Wrap in bacon.' },
              { '@type': 'HowToStep', text: 'Bake 25 minutes.' },
            ],
          },
        ],
      }),
      URL,
    );

    expect(data!.steps).toEqual([
      'Prep:',
      'Trim the asparagus.',
      'Cook:',
      'Wrap in bacon.',
      'Bake 25 minutes.',
    ]);
  });

  // The library requires these; Homestead does not. Each must still import.
  it.each(['author', 'image', 'description', 'recipeYield'])(
    'imports a recipe with no %s',
    async (field) => {
      const partial: Record<string, unknown> = { ...FULL };
      delete partial[field];

      const result = await importRecipeFromHtml(page(partial), URL);

      expect(result.errors).toEqual([]);
      expect(result.data?.title).toBe('Bacon Wrapped Asparagus');
      expect(result.data?.parsed_ingredients.length).toBeGreaterThan(0);
    },
  );

  it('leaves servings unset when the page has no yield', async () => {
    const partial: Record<string, unknown> = { ...FULL };
    delete partial.recipeYield;
    const { data } = await importRecipeFromHtml(page(partial), URL);
    expect(data!.servings).toBeUndefined();
  });

  it('does not let the placeholder leak into an imported field', async () => {
    const partial: Record<string, unknown> = { ...FULL };
    delete partial.description;
    delete partial.author;
    const { data } = await importRecipeFromHtml(page(partial), URL);
    expect(JSON.stringify(data)).not.toContain('homestead_absent');
    expect(JSON.stringify(data)).not.toContain('absent.invalid');
  });

  it('still prefers real page values over the placeholders', async () => {
    const { data } = await importRecipeFromHtml(page(FULL), URL);
    expect(data!.method).toContain('Crispy bacon, tender asparagus.');
  });

  it('reports a page with no recipe markup as an error', async () => {
    const result = await importRecipeFromHtml(
      '<html><body><p>Just a blog post.</p></body></html>',
      URL,
    );
    expect(result.data).toBeUndefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('not-a-supported-host.example');
  });

  it('warns rather than fails when a recipe has no ingredients', async () => {
    const partial: Record<string, unknown> = { ...FULL, recipeIngredient: [] };
    const result = await importRecipeFromHtml(page(partial), URL);
    if (result.data) {
      expect(result.warnings.join(' ')).toMatch(/no ingredients/i);
    } else {
      // The library may reject an empty ingredient list outright; either way
      // the failure is reported rather than thrown.
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe('mapIngredients', () => {
  it('carries an ingredient group name onto its members as `group`, not notes', () => {
    const recipe = {
      ingredients: [
        { name: 'For the sauce', items: [{ value: '1 cup stock (low sodium)' }] },
        { name: '', items: [{ value: '2 eggs' }] },
      ],
    } as unknown as RecipeObject;

    const [stock, eggs] = mapIngredients(recipe);
    expect(stock).toMatchObject({ item: 'stock', group: 'For the sauce', notes: 'low sodium' });
    expect(eggs).not.toHaveProperty('group');
    expect(eggs).not.toHaveProperty('notes');
  });
});
