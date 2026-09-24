/**
 * Recipe — a cooking recipe captured as a document (a photo of a cookbook page,
 * a printed or PDF recipe, a saved web page).
 *
 * See form-1099-int.ts for the authoring notes on `description`. This type is
 * the documents-app on-ramp to the Recipes app: its `post_classify` hook creates
 * a `recipe` record from the fields extracted here, so the same field shapes the
 * recipe resource declares (a structured ingredient list, ordered steps) are
 * extracted in the single classify pass. The document's AI-inferred title
 * becomes the recipe's title — this type declares no name field of its own, and
 * so deliberately omits a `title_template`: the dish name the model writes is a
 * better title than any field this type extracts.
 */

import type { DocType } from './docType';

const recipe: DocType = {
  id: 'recipe',
  label: 'Recipe',
  icon: () => import('lucide-react').then((m) => m.ChefHat),
  // On a match, create a Recipe in the Recipes app (server-only hook).
  post_classify: () => import('./post-classify/recipe.server'),
  description:
    'A cooking recipe — a list of ingredients with quantities and a set of ' +
    'preparation steps, from a cookbook page, a printed or PDF recipe card, a ' +
    'recipe website, or a handwritten card. Usually names a dish and shows ' +
    'ingredients (often with amounts) and numbered or paragraph instructions, ' +
    'sometimes prep/cook times and a serving yield. Do not use this type for a ' +
    'restaurant menu, a grocery receipt, or a nutrition label.',
  fields: {
    parsed_ingredients: {
      label: 'Ingredients',
      type: 'array',
      description:
        'The recipe ingredients, one array entry per ingredient line. Parse ' +
        'each into its parts. Preserve the order they appear in.',
      items: {
        label: 'Ingredient',
        type: 'object',
        properties: {
          item: {
            label: 'Item',
            type: 'string',
            description:
              'The ingredient name, normalized (e.g. "all-purpose flour"), ' +
              'without the quantity or unit.',
          },
          qty: {
            label: 'Quantity',
            type: 'number',
            description:
              'The numeric amount, as a decimal (½ → 0.5, "1 1/2" → 1.5). ' +
              'Leave null when the ingredient has no measured amount.',
          },
          unit: {
            label: 'Unit',
            type: 'string',
            description:
              'The unit of measure, standardized (cup, tsp, tbsp, g, oz, ' +
              'whole, ...). Leave null when there is none.',
          },
          raw: {
            label: 'Original text',
            type: 'string',
            description: 'The original ingredient line, exactly as printed.',
          },
          group: {
            label: 'Section',
            type: 'string',
            description:
              'The sub-heading the ingredient is listed under (e.g. "For the ' +
              'sauce"). Null when the list has no sub-headings.',
          },
        },
      },
    },
    steps: {
      label: 'Steps',
      type: 'array',
      description:
        'The preparation steps in order, one array entry per step. Copy each ' +
        'step’s text; drop the leading step number if there is one.',
      items: {
        label: 'Step',
        type: 'string',
        description: 'A single preparation step.',
      },
    },
    prep_time: {
      label: 'Prep time',
      type: 'string',
      description: 'The hands-on prep time as printed (e.g. "10 mins"). Null if absent.',
    },
    cook_time: {
      label: 'Cook time',
      type: 'string',
      description: 'The cooking/baking time as printed (e.g. "25 mins"). Null if absent.',
    },
    servings: {
      label: 'Servings',
      type: 'string',
      description: 'The yield or servings as printed (e.g. "Serves 4"). Null if absent.',
    },
    method: {
      label: 'Notes',
      type: 'string',
      description:
        'Any free-form notes, tips, or nutrition info printed with the recipe ' +
        'that are not ingredients or steps. Null if none.',
    },
    tags: {
      label: 'Tags',
      type: 'array',
      description:
        'A few short categorical tags for the dish (e.g. "dessert", "vegan", ' +
        '"italian"), inferred from the recipe. Empty/null if unclear.',
      items: {
        label: 'Tag',
        type: 'string',
        description: 'A single lowercase tag.',
      },
    },
    source_pointer: {
      label: 'Source',
      type: 'string',
      description:
        'The recipe’s source if printed on the document — a URL, book title ' +
        'and page, or author. Null if none is shown.',
    },
  },
};

export default recipe;
