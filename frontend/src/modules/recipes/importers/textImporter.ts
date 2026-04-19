/**
 * Plain-text recipe importer.
 *
 * Accepts the semi-structured recipe format commonly copy/pasted from
 * blog print views:
 *
 *     Title
 *
 *     Prep Time: 10 mins | Cook Time: 25 mins | Servings: 8
 *
 *     Ingredients:
 *     1 pound asparagus, trimmed
 *     1/2 teaspoon black pepper
 *
 *     Directions:
 *     Preheat the oven...
 *     Wrap and bake...
 *
 *     Notes:
 *     Freezes well.
 *
 *     Nutrition:
 *     CALORIES: 177kcal
 *
 *     Source: https://example.com/recipe
 *
 * Everything except the title is optional. Unknown sections are ignored.
 */

import type { RecipeFormData, RecipeIngredient } from '../types';
import type { RecipeImportResult, TextRecipeImporter } from './types';

// Known section headers. Keys are normalized (lowercased, trailing colon
// stripped); values are the canonical bucket name. Duplicates here let us
// accept common variants (e.g. "Instructions" -> directions).
const SECTION_ALIASES: Record<string, string> = {
  ingredients: 'ingredients',
  directions: 'directions',
  instructions: 'directions',
  method: 'directions',
  steps: 'directions',
  notes: 'notes',
  note: 'notes',
  tips: 'notes',
  nutrition: 'nutrition',
  'nutrition facts': 'nutrition',
  source: 'source',
  url: 'source',
};

// Cooking units we recognize when splitting an ingredient line. Matching is
// case-insensitive and word-boundary anchored. Order doesn't matter.
const UNIT_WORDS = [
  'cup', 'cups',
  'tablespoon', 'tablespoons', 'tbsp', 'tbsps', 'tbs',
  'teaspoon', 'teaspoons', 'tsp', 'tsps',
  'pound', 'pounds', 'lb', 'lbs',
  'ounce', 'ounces', 'oz',
  'gram', 'grams', 'g',
  'kilogram', 'kilograms', 'kg',
  'milligram', 'milligrams', 'mg',
  'liter', 'liters', 'litre', 'litres', 'l',
  'milliliter', 'milliliters', 'millilitre', 'millilitres', 'ml',
  'clove', 'cloves',
  'slice', 'slices',
  'strip', 'strips',
  'piece', 'pieces',
  'can', 'cans',
  'jar', 'jars',
  'bottle', 'bottles',
  'package', 'packages', 'pkg',
  'bunch', 'bunches',
  'sprig', 'sprigs',
  'stick', 'sticks',
  'head', 'heads',
  'pinch', 'pinches',
  'dash', 'dashes',
  'handful', 'handfuls',
  'quart', 'quarts',
  'pint', 'pints',
  'gallon', 'gallons',
  'inch', 'inches',
];

const UNIT_SET = new Set(UNIT_WORDS.map((u) => u.toLowerCase()));

// Unicode vulgar fractions that users paste in. Map to decimal equivalents.
const VULGAR_FRACTIONS: Record<string, number> = {
  '\u00BC': 0.25, // ¼
  '\u00BD': 0.5,  // ½
  '\u00BE': 0.75, // ¾
  '\u2153': 1 / 3, // ⅓
  '\u2154': 2 / 3, // ⅔
  '\u2155': 0.2, // ⅕
  '\u2156': 0.4, // ⅖
  '\u2157': 0.6, // ⅗
  '\u2158': 0.8, // ⅘
  '\u2159': 1 / 6, // ⅙
  '\u215A': 5 / 6, // ⅚
  '\u215B': 0.125, // ⅛
  '\u215C': 0.375, // ⅜
  '\u215D': 0.625, // ⅝
  '\u215E': 0.875, // ⅞
};

/**
 * Parse a leading quantity off an ingredient line. Supports:
 *   - integers: `3 cups`
 *   - decimals: `1.5 cups`
 *   - fractions: `1/2 cup`
 *   - mixed: `1 1/2 cups`
 *   - unicode: `½ cup`, `1 ½ cups`
 *   - hyphenated ranges (first value wins): `1-2 cups`
 *
 * Returns `{ qty, rest }` where `rest` is the remainder of the line after
 * the quantity. If no quantity is detected, `qty` defaults to 1 and the
 * whole line is treated as `rest`.
 */
export function parseQuantity(line: string): { qty: number; rest: string } {
  const trimmed = line.trim();
  if (!trimmed) return { qty: 1, rest: '' };

  // Replace unicode fractions with " <decimal>" so the numeric regex below
  // can handle them uniformly. Insert a space so "1½" becomes "1 0.5".
  let normalized = trimmed;
  for (const [glyph, value] of Object.entries(VULGAR_FRACTIONS)) {
    normalized = normalized.replace(new RegExp(glyph, 'g'), ` ${value} `);
  }
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Number tokens: fractions first (alternation is left-to-right, so `1/2`
  // would otherwise match as just `1`), then decimals, then integers.
  const numberToken = /^(\d+\/\d+|\d+\.\d+|\d+)/;

  let remaining = normalized;
  let qty = 0;
  let matched = false;

  // Consume up to two numeric tokens (mixed number: "1 1/2").
  for (let i = 0; i < 2; i++) {
    const m = remaining.match(numberToken);
    if (!m) break;
    const token = m[1];
    const value = token.includes('/')
      ? (() => {
          const [n, d] = token.split('/').map(Number);
          return d === 0 ? 0 : n / d;
        })()
      : parseFloat(token);
    qty += value;
    matched = true;
    remaining = remaining.slice(m[0].length).trim();
    // Skip a range separator so "1-2 cups" reads as 1.
    remaining = remaining.replace(/^[-\u2013\u2014]\s*\d+(?:\.\d+)?(?:\/\d+)?\s*/, '');
    // Only consume a second token if the separator was a space (mixed
    // number). Otherwise we'd eat the "2" from "2 cups".
    if (!/^\d/.test(remaining)) break;
  }

  if (!matched) return { qty: 1, rest: trimmed };
  return { qty, rest: remaining };
}

/**
 * Split an ingredient line into `{ qty, unit, item, raw }`.
 *
 * Heuristic only — the `raw` line is always preserved so users can fix
 * anything we got wrong in the form.
 */
export function parseIngredientLine(line: string): RecipeIngredient {
  const raw = line.trim();
  const { qty, rest } = parseQuantity(raw);

  const tokens = rest.split(/\s+/).filter(Boolean);
  let unit = '';
  let itemStart = 0;
  if (tokens.length > 0 && UNIT_SET.has(tokens[0].toLowerCase().replace(/\.$/, ''))) {
    unit = tokens[0].replace(/\.$/, '');
    itemStart = 1;
  }
  const item = tokens.slice(itemStart).join(' ').trim();

  return { qty, unit, item, raw };
}

interface Section {
  canonical: string;
  lines: string[];
}

/**
 * Group the body into labeled sections. Lines before the first recognized
 * header are returned under the synthetic `__header__` key (where we look
 * for the title and any `Source:` hint).
 */
function splitSections(body: string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: Section = { canonical: '__header__', lines: [] };
  sections.set(current.canonical, current.lines);

  for (const raw of body) {
    const trimmed = raw.trim();
    const headerMatch = trimmed.match(/^([A-Za-z][A-Za-z \-]*?):\s*$/);
    if (headerMatch) {
      const key = headerMatch[1].trim().toLowerCase();
      const canonical = SECTION_ALIASES[key];
      if (canonical) {
        current = { canonical, lines: [] };
        sections.set(canonical, current.lines);
        continue;
      }
    }
    current.lines.push(raw);
  }

  return sections;
}

/** Trim leading/trailing blank lines in a section. */
function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

/** Extract a Source URL from free-form header lines if one is embedded there. */
function extractInlineSource(lines: string[]): string | undefined {
  for (const line of lines) {
    const m = line.match(/^\s*(?:source|url)\s*:\s*(.+?)\s*$/i);
    if (m) return m[1];
  }
  return undefined;
}

function buildMethod(
  directions: string[] | undefined,
  notes: string[] | undefined,
  nutrition: string[] | undefined,
  metadata: string[],
): string | undefined {
  const parts: string[] = [];

  if (metadata.length) {
    parts.push(metadata.join('\n'));
  }

  if (directions && directions.length) {
    const cleaned = trimBlankEdges(directions).filter((l) => l.trim().length > 0);
    if (cleaned.length) {
      const numbered = cleaned
        .map((line, idx) => `${idx + 1}. ${line.trim()}`)
        .join('\n');
      parts.push(`## Directions\n\n${numbered}`);
    }
  }

  if (notes && notes.length) {
    const cleaned = trimBlankEdges(notes).filter((l) => l.trim().length > 0);
    if (cleaned.length) {
      parts.push(`## Notes\n\n${cleaned.map((l) => `- ${l.trim()}`).join('\n')}`);
    }
  }

  if (nutrition && nutrition.length) {
    const cleaned = trimBlankEdges(nutrition).filter((l) => l.trim().length > 0);
    if (cleaned.length) {
      parts.push(`## Nutrition\n\n${cleaned.map((l) => `- ${l.trim()}`).join('\n')}`);
    }
  }

  const method = parts.join('\n\n').trim();
  return method.length > 0 ? method : undefined;
}

export const textImporter: TextRecipeImporter = {
  id: 'text',
  label: 'Plain Text',
  inputType: 'text',
  description:
    'Paste a recipe with sections like "Ingredients:", "Directions:", and "Source:". Headings are matched case-insensitively.',
  placeholder:
    'Bacon Wrapped Asparagus\n\nIngredients:\n1 pound asparagus, trimmed\n...\n\nDirections:\n...\n\nSource: https://...',

  parse(input: string): RecipeImportResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!input || !input.trim()) {
      errors.push('Paste a recipe to import.');
      return { warnings, errors };
    }

    const lines = input.replace(/\r\n/g, '\n').split('\n');

    // Title: first non-empty line. Also consume it from the header stream.
    let titleIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().length > 0) {
        titleIndex = i;
        break;
      }
    }
    if (titleIndex === -1) {
      errors.push('Could not find a recipe title.');
      return { warnings, errors };
    }
    const title = lines[titleIndex].trim();
    const body = lines.slice(titleIndex + 1);

    const sections = splitSections(body);

    const header = trimBlankEdges(sections.get('__header__') ?? []);
    const ingredientLines = trimBlankEdges(sections.get('ingredients') ?? []);
    const directions = sections.get('directions');
    const notes = sections.get('notes');
    const nutrition = sections.get('nutrition');
    const sourceLines = trimBlankEdges(sections.get('source') ?? []);

    // Header lines that aren't an inline "Source:" become metadata we prepend
    // to the method (prep time / cook time / servings / yield, etc.).
    const metadata = header.filter((l) => !/^\s*(?:source|url)\s*:/i.test(l));

    const inlineSource = extractInlineSource(header);
    const trailingSource = extractInlineSource(
      body.filter((l) => /^\s*(?:source|url)\s*:/i.test(l)),
    );
    const dedicatedSource = sourceLines.find((l) => l.trim().length > 0)?.trim();
    const source_pointer = dedicatedSource || inlineSource || trailingSource;

    const parsed_ingredients = ingredientLines
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map(parseIngredientLine);

    if (parsed_ingredients.length === 0) {
      warnings.push(
        'No ingredients were detected. Add an "Ingredients:" section or edit the recipe after importing.',
      );
    }

    if (!directions || directions.every((l) => !l.trim())) {
      warnings.push(
        'No directions were detected. Add a "Directions:" section or edit the recipe after importing.',
      );
    }

    const method = buildMethod(directions, notes, nutrition, metadata);

    const data: RecipeFormData = {
      title,
      source_pointer,
      parsed_ingredients,
      method,
    };

    return { data, warnings, errors };
  },
};
