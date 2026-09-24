/**
 * Recipe importer for a web page's HTML.
 *
 * Extraction is delegated to the `recipe-scrapers` library, which carries its
 * own ladder: a site-specific scraper when it has one for the host, otherwise
 * (`wildMode`) generic schema.org markup — JSON-LD, microdata, or RDFa. That
 * covers the `@graph` traversal, nested `HowToSection` instructions, and
 * ISO-8601 durations that a hand-rolled JSON-LD reader has to get right.
 *
 * This module is the *mapping* half and does no network I/O: it takes HTML that
 * someone else fetched and turns it into a {@link RecipeFormData}. Fetching is
 * the caller's job (`../methods/bulk-import-url`, via the SSRF-guarded
 * `safeFetch`), which keeps this pure and its tests offline.
 *
 * Two deliberate departures from the library's output:
 *
 *  - **Ingredient lines go through {@link parseIngredientLine}, not the
 *    library's `parseIngredients`.** Ours knows the unit vocabulary this app
 *    already uses (it reads `slices` as a unit; the library returns it as part
 *    of the name) and pulls parenthetical asides into `notes`, which is what
 *    keeps `item` clean enough for grocery-list matching. We do borrow the
 *    library's `quantity2`, since it detects ranges and `parseQuantity` drops
 *    them.
 *  - **Absent-field sentinels.** The library treats `author`, `image`, and
 *    `description` as required and fails extraction outright when a page has
 *    none — but Homestead requires only a title and ingredients, so a recipe
 *    with no byline is still a recipe. A lowest-priority extractor supplies
 *    placeholder values that real extractors override, and {@link absent}
 *    strips them here.
 */

import { load, type CheerioAPI } from 'cheerio';
import {
  ExtractorPlugin,
  scrapeRecipe,
  type RecipeFields,
  type RecipeObject,
  type SafeParseError,
} from 'recipe-scrapers';
import type { RecipeFormData, RecipeIngredient } from '../types';
import { parseIngredientLine } from './textImporter';
import type { RecipeImportResult } from './types';

/**
 * Placeholder for a field the library requires but Homestead does not.
 *
 * Must be non-empty — the library's schema rejects empty strings — and must
 * never collide with real page prose, hence the shape. It is matched on the way
 * out by body rather than by identity: the library normalizes extracted strings
 * before returning them (the leading NUL is dropped), so the value that comes
 * back is not byte-identical to the one we supplied.
 */
const ABSENT_BODY = '__homestead_absent__';
const ABSENT = `\u0000${ABSENT_BODY}`;

/** Same idea for `image`, which is validated as a URL rather than a string. */
const ABSENT_URL = 'https://absent.invalid/none.png';

/** Undefined when `value` is a sentinel or blank; the cleaned string otherwise. */
function absent(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.split('\u0000').join('').trim();
  if (!trimmed || trimmed === ABSENT_BODY || trimmed === ABSENT_URL) return undefined;
  return trimmed;
}

/**
 * Supplies the fields above so extraction reaches the mapping stage instead of
 * failing. Priority is far below the real extractors', and the library runs
 * higher priorities first, so a page that *does* carry an author still wins.
 */
class AbsentFieldDefaults extends ExtractorPlugin {
  name = 'homestead-absent-defaults';
  priority = -100_000;

  private static readonly FIELDS: ReadonlySet<string> = new Set([
    'author',
    'image',
    'description',
    'siteName',
    'cookingMethod',
    'language',
  ]);

  supports(field: keyof RecipeFields): boolean {
    return AbsentFieldDefaults.FIELDS.has(field);
  }

  extract<Key extends keyof RecipeFields>(field: Key): RecipeFields[Key] {
    // Every supported field is a string one, so the cast narrows to whichever
    // of them `Key` resolved to rather than widening the plugin's contract.
    return (field === 'image' ? ABSENT_URL : ABSENT) as RecipeFields[Key];
  }
}

/**
 * `ExtractorPlugin` takes the page's cheerio root so a plugin can read the DOM.
 * This one only ever returns constants, so it gets an empty document rather
 * than a second parse of the page.
 */
const EMPTY_ROOT: CheerioAPI = load('');

/** Minutes to the human-readable string the `prep_time` / `cook_time` fields hold. */
export function formatMinutes(total: number | null | undefined): string | undefined {
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return undefined;
  const minutes = Math.round(total);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min${rest === 1 ? '' : 's'}`;
  const hourPart = `${hours} hr${hours === 1 ? '' : 's'}`;
  return rest === 0 ? hourPart : `${hourPart} ${rest} min${rest === 1 ? '' : 's'}`;
}

/** Join note fragments the way {@link parseIngredientLine} joins multiple asides. */
function joinNotes(...parts: Array<string | undefined>): string | undefined {
  const kept = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return kept.length > 0 ? kept.join('; ') : undefined;
}

/**
 * Flatten the library's ingredient *groups* into the flat list the schema holds,
 * carrying each group's name ("For the sauce") onto its members as `group`.
 */
export function mapIngredients(recipe: RecipeObject): RecipeIngredient[] {
  const out: RecipeIngredient[] = [];

  for (const group of recipe.ingredients ?? []) {
    const groupName = absent(group.name);
    for (const item of group.items ?? []) {
      const line = item.value?.trim();
      if (!line) continue;

      const parsed = parseIngredientLine(line);

      // The library detects ranges ("1-2 cloves"); parseQuantity keeps only the
      // low end, so record the high end rather than silently losing it.
      const high = item.parsed?.quantity2;
      const range =
        typeof high === 'number' && Number.isFinite(high) && high !== parsed.qty
          ? `up to ${high}`
          : undefined;

      // `notes` is optional in the schema, so omit the key rather than
      // sending an undefined one.
      const { notes: _parsedNotes, ...base } = parsed;
      const notes = joinNotes(parsed.notes, range);
      out.push({
        ...base,
        ...(notes ? { notes } : {}),
        ...(groupName ? { group: groupName } : {}),
      });
    }
  }

  return out;
}

/**
 * Flatten instruction groups into ordered steps.
 *
 * Named groups ("Prep", "Cook") only appear when the source used
 * `HowToSection`. Since `steps` is a flat list, a named group contributes a
 * heading step so the sequence still reads correctly; an unnamed single group —
 * the common case — contributes nothing extra.
 */
export function mapSteps(recipe: RecipeObject): string[] {
  const groups = recipe.instructions ?? [];
  const named = groups.filter((g) => !!absent(g.name)).length > 0;
  const steps: string[] = [];

  for (const group of groups) {
    const name = absent(group.name);
    const items = (group.items ?? [])
      .map((i) => i.value?.trim())
      .filter((v): v is string => !!v);
    if (items.length === 0) continue;
    if (named && name) steps.push(`${name}:`);
    steps.push(...items);
  }

  return steps;
}

/** Dedupe tags case-insensitively while keeping the first spelling seen. */
export function mapTags(recipe: RecipeObject): string[] | undefined {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of [
    ...(recipe.category ?? []),
    ...(recipe.cuisine ?? []),
    ...(recipe.keywords ?? []),
  ]) {
    const tag = absent(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags.length > 0 ? tags : undefined;
}

/**
 * Compose the free-form `method` body.
 *
 * Mirrors the `## Notes` / `## Nutrition` layout the plain-text importer
 * produces, so a recipe reads the same however it arrived.
 */
export function buildMethod(recipe: RecipeObject): string | undefined {
  const parts: string[] = [];

  const description = absent(recipe.description);
  if (description) parts.push(description);

  const notes = (recipe.notes ?? []).flatMap((group) => {
    const name = absent(group.name);
    const items = (group.items ?? [])
      .map((i) => absent(i.value))
      .filter((v): v is string => !!v);
    if (items.length === 0) return [];
    return name ? [`**${name}**`, ...items] : items;
  });
  if (notes.length > 0) {
    parts.push(`## Notes\n\n${notes.map((n) => `- ${n}`).join('\n')}`);
  }

  const nutrients = Object.entries(recipe.nutrients ?? {}).filter(
    ([, value]) => !!absent(value),
  );
  if (nutrients.length > 0) {
    parts.push(
      `## Nutrition\n\n${nutrients.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`,
    );
  }

  const method = parts.join('\n\n').trim();
  return method.length > 0 ? method : undefined;
}

/** Turn the library's structured failure into something a user can act on. */
function describeFailure(error: SafeParseError, url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  switch (error.code) {
    case 'extractor_not_found':
      return `No recipe found on ${host}${
        error.context?.field ? ` (missing ${error.context.field})` : ''
      }. The page may not publish structured recipe data.`;
    case 'extraction_failed':
      return `Could not read a recipe from ${host}. The page may not publish structured recipe data.`;
    case 'extraction_runtime_error':
      return `Reading the recipe from ${host} failed unexpectedly.`;
    case 'validation_failed': {
      const fields = error.issues
        .map((i) => i.dotPath ?? i.path?.join('.'))
        .filter(Boolean)
        .join(', ');
      return `The recipe on ${host} was incomplete${fields ? ` (${fields})` : ''}.`;
    }
    default:
      return `Could not import a recipe from ${host}.`;
  }
}

/**
 * Map already-fetched HTML to a recipe.
 *
 * `url` is the URL the HTML came from *after* redirects — the library uses it
 * to pick a site-specific scraper, and it becomes the recipe's `source_pointer`.
 */
export async function importRecipeFromHtml(
  html: string,
  url: string,
): Promise<RecipeImportResult> {
  const warnings: string[] = [];

  const result = await scrapeRecipe(html, url, {
    safeParse: true,
    wildMode: true,
    parseNotes: true,
    parseIngredients: true,
    fallbackYield: ABSENT,
    extraExtractors: [new AbsentFieldDefaults(EMPTY_ROOT)],
  });

  if (!result.success) {
    return { warnings, errors: [describeFailure(result.error, url)] };
  }

  const recipe = result.data;
  const title = absent(recipe.title);
  if (!title) {
    return { warnings, errors: ['The page did not name the recipe.'] };
  }

  const parsed_ingredients = mapIngredients(recipe);
  if (parsed_ingredients.length === 0) {
    warnings.push('No ingredients were found — add them after importing.');
  }

  const steps = mapSteps(recipe);
  if (steps.length === 0) {
    warnings.push('No directions were found — add them after importing.');
  }

  const data: RecipeFormData = {
    title,
    source_pointer: absent(recipe.canonicalUrl) ?? url,
    parsed_ingredients,
    steps: steps.length > 0 ? steps : undefined,
    prep_time: formatMinutes(recipe.prepTime),
    cook_time: formatMinutes(recipe.cookTime),
    servings: absent(recipe.yields),
    tags: mapTags(recipe),
    method: buildMethod(recipe),
  };

  return { data, warnings, errors: [] };
}
