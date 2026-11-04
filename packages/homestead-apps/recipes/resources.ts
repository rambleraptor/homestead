import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const RECIPES = 'recipes' as const;
export const RECIPE_LOGS = 'logs' as const;
export const COOKBOOKS = 'cookbooks' as const;

/**
 * The `auto` value of the one cookbook the server keeps for social-post
 * imports (TikTok, Instagram, YouTube). Created on the first such import and
 * appended to on every later one; the SPA hides delete for it.
 */
export const SOCIAL_COOKBOOK = 'social' as const;

export const recipesResources: ResourceDefinition[] = [
  {
    singular: 'recipe',
    plural: RECIPES,
    description: 'A culinary recipe with parsed ingredients for scaling.',
    user_settable_create: true,
    // Importers never produce an image, so the saver is the default
    // one-create-per-item step plus one follow-up: a social-post import is
    // filed into the automatic "From social" cookbook.
    bulkImport: {
      save: () => import('./methods/bulk-import-save'),
      formats: [
        {
          id: 'url',
          label: 'Web Page (URL)',
          inputType: 'text',
          load: () => import('./methods/bulk-import-url'),
        },
        {
          id: 'social',
          label: 'Social Post',
          inputType: 'text',
          description:
            'Paste TikTok, Instagram, or YouTube links, one per line. The recipe is read from the caption, or from a recipe page the caption links to.',
          requiresAi: true,
          load: () => import('./methods/bulk-import-social'),
        },
        {
          id: 'screenshots',
          label: 'Screenshots',
          inputType: 'file',
          accept: 'image/png,image/jpeg,image/webp,image/gif',
          multiple: true,
          description:
            'Upload screenshots of a recipe — a caption, a video frame, a cookbook page. Several screenshots of one recipe are read together.',
          requiresAi: true,
          load: () => import('./methods/bulk-import-screenshots'),
        },
        {
          id: 'text',
          label: 'Plain Text',
          inputType: 'text',
          load: () => import('./methods/bulk-import-text'),
        },
        {
          id: 'paprika',
          label: 'Paprika',
          inputType: 'file',
          accept: '.paprikarecipe,.paprikarecipes',
          multiple: true,
          load: () => import('./methods/bulk-import-paprika'),
        },
      ],
    },
    fields: {
      title: {
        type: 'string',
        description: 'Display name of the recipe.',
        required: true,
      },
      source_pointer: {
        type: 'string',
        description:
          "URI or physical reference (e.g. 'https://...' or 'Book: Food Lab pg 124').",
      },
      parsed_ingredients: {
        type: 'array',
        description:
          'Structured ingredient list separated from quantities for scaling.',
        required: true,
        items: {
          type: 'object',
          properties: {
            item: {
              type: 'string',
              description: 'Normalized ingredient name.',
            },
            qty: {
              type: 'number',
              description: 'Numerical quantity (decimal for fractions).',
            },
            unit: {
              type: 'string',
              description:
                'Standardized unit (cup, tsp, g, whole, ...).',
            },
            notes: {
              type: 'string',
              description:
                'Substitutions or other context (e.g. "or 8 thighs, 4 breasts", "to taste").',
            },
            raw: {
              type: 'string',
              description: 'Original unparsed ingredient string.',
            },
            group: {
              type: 'string',
              description:
                'Section heading the ingredient is listed under (e.g. "For the sauce"). Omit for recipes without sections.',
            },
          },
        },
      },
      method: {
        type: 'string',
        description:
          'Free-form notes, nutrition, or other context (Markdown).',
      },
      steps: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Ordered cooking steps. Rendered as a numbered list.',
      },
      prep_time: {
        type: 'string',
        description: "Human-readable prep time (e.g. '10 mins').",
      },
      cook_time: {
        type: 'string',
        description: "Human-readable cook time (e.g. '25 mins').",
      },
      servings: {
        type: 'string',
        description: "Human-readable yield / servings (e.g. '8 bundles').",
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Categorical tags for filtering and menu generation.',
      },
      image: {
        type: 'file',
        description: 'Recipe photo (jpeg/png/webp/gif, <=5MB).',
      },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
  {
    singular: 'cookbook',
    plural: COOKBOOKS,
    description:
      'A named collection of recipes someone groups on purpose (a weeknight ' +
      'rotation, a holiday menu). Shown to people as a "collection". Tags ' +
      'describe a recipe; a collection gathers recipes. A recipe can be in ' +
      'many collections.',
    user_settable_create: true,
    fields: {
      name: {
        type: 'string',
        required: true,
        description: 'Display name of the cookbook.',
      },
      description: {
        type: 'string',
        description: 'What the cookbook is for, in a sentence.',
      },
      /**
       * Membership lives here, not on the recipe, so adding a recipe doesn't
       * rewrite the recipe. Unordered: the SPA shows members the way the
       * library does. `set-null` drops a deleted recipe's id out of every
       * cookbook.
       */
      recipes: {
        type: 'array',
        items: {
          type: 'string',
          reference: { resource: 'recipe', onDelete: 'set-null' },
        },
        description:
          'Ids of the recipes in this collection. Order is not meaningful. ' +
          'Replace the whole list to add or remove recipes.',
      },
      /**
       * Set only on the server-kept cookbook that collects social-post imports;
       * absent on cookbooks people make. One per value.
       */
      auto: {
        type: 'string',
        enum: [SOCIAL_COOKBOOK],
        description:
          'Marks the automatic cookbook that collects recipes imported from ' +
          'social posts. Not set on cookbooks people make; never set it by hand.',
      },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
  {
    singular: 'log',
    plural: RECIPE_LOGS,
    description:
      'A single cooking attempt of a recipe with outcome and notes.',
    user_settable_create: true,
    parents: ['recipe'],
    fields: {
      date: { type: 'string', format: 'date-time', required: true },
      notes: { type: 'string' },
      success: { type: 'boolean' },
      rating: { type: 'number', description: '1-5 scale' },
      deviated: { type: 'boolean' },
      deviation_notes: { type: 'string' },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
];
