/**
 * Doc-type validation, merging, and compilation into schema variants + Zod.
 *
 * The built-in types are imported here (not fixtured), so a typo in a shipped
 * doc type — a non-kebab id, a mistyped field, a missing icon — fails this suite
 * rather than surfacing at boot.
 */

import { describe, expect, it } from 'vitest';
import { FileText } from 'lucide-react';
import {
  validateDocType,
  toVariants,
  docTypeIds,
  toExtractionSchema,
  freeTitlePlaceholders,
  readFacts,
  renderTitleTemplate,
  replaceMetadata,
  toUnknownExtractionSchema,
  UNKNOWN_DOC_TYPE,
  type DocType,
} from '../doc-types/docType';
import { BUILTIN_DOC_TYPES } from '../doc-types/builtins';
import type { LazyIcon } from '@rambleraptor/homestead-core/apps/types';

/** A stand-in lazy icon for the test doc types below. */
const stubIcon: LazyIcon = () => Promise.resolve(FileText);

/** A minimal well-formed doc type, spread over in the invalid-input cases. */
const wellFormed = {
  id: 'form-x',
  label: 'Form X',
  description: 'A form.',
  icon: stubIcon,
  fields: { payer_name: { label: 'Payer name', type: 'string', description: 'Who paid.' } },
};

const type = (id: string, fields: DocType['fields']): DocType => ({
  id,
  label: id,
  description: `the ${id}`,
  icon: stubIcon,
  fields,
});

describe('validateDocType', () => {
  it('accepts a well-formed doc type', () => {
    expect(validateDocType(wellFormed, 'form-x.ts')).toEqual(wellFormed);
  });

  it('names the offending file in every error', () => {
    expect(() => validateDocType({ id: 'Form_X' }, 'bad.ts')).toThrow(/"bad\.ts"/);
  });

  it('rejects a non-object module export', () => {
    expect(() => validateDocType(undefined, 'x.ts')).toThrow(/must default-export/);
  });

  it('rejects a non-kebab-case id', () => {
    expect(() => validateDocType({ ...wellFormed, id: 'formX' }, 'x.ts')).toThrow(
      /must be kebab-case/,
    );
  });

  it('reserves the unknown id', () => {
    expect(() =>
      validateDocType({ ...wellFormed, id: UNKNOWN_DOC_TYPE }, 'x.ts'),
    ).toThrow(/reserved for unmatched documents/);
  });

  it('requires a description — it is what the model classifies on', () => {
    expect(() =>
      validateDocType({ ...wellFormed, description: undefined }, 'x.ts'),
    ).toThrow(/description is required/);
  });

  it('requires an icon', () => {
    expect(() => validateDocType({ ...wellFormed, icon: undefined }, 'x.ts')).toThrow(
      /icon is required/,
    );
  });

  it('rejects non-snake_case field names', () => {
    expect(() =>
      validateDocType(
        { ...wellFormed, fields: { payerName: { label: 'P', type: 'string' } } },
        'x.ts',
      ),
    ).toThrow(/"payerName" must be snake_case/);
  });

  it('rejects unsupported field types', () => {
    expect(() =>
      validateDocType(
        { ...wellFormed, fields: { paid: { label: 'P', type: 'boolean' } } },
        'x.ts',
      ),
    ).toThrow(/type must be "string", "number", "array", or "object"/);
  });

  it('rejects a doc type with no fields', () => {
    expect(() => validateDocType({ ...wellFormed, fields: {} }, 'x.ts')).toThrow(
      /declares no fields/,
    );
  });

  it('accepts array and object fields with their nested shapes', () => {
    const ingredients = {
      ...wellFormed,
      fields: {
        items: {
          label: 'Items',
          type: 'array',
          items: {
            label: 'Item',
            type: 'object',
            properties: {
              name: { label: 'Name', type: 'string' },
              qty: { label: 'Qty', type: 'number' },
            },
          },
        },
      },
    };
    expect(() => validateDocType(ingredients, 'x.ts')).not.toThrow();
  });

  it('rejects an array field with no items', () => {
    expect(() =>
      validateDocType(
        { ...wellFormed, fields: { list: { label: 'List', type: 'array' } } },
        'x.ts',
      ),
    ).toThrow(/array field "list" must declare items/);
  });

  it('rejects an object field with no properties', () => {
    expect(() =>
      validateDocType(
        { ...wellFormed, fields: { blob: { label: 'Blob', type: 'object' } } },
        'x.ts',
      ),
    ).toThrow(/object field "blob" must declare properties/);
  });

  it('rejects a non-snake_case nested property name', () => {
    expect(() =>
      validateDocType(
        {
          ...wellFormed,
          fields: {
            row: {
              label: 'Row',
              type: 'object',
              properties: { badName: { label: 'B', type: 'string' } },
            },
          },
        },
        'x.ts',
      ),
    ).toThrow(/"row\.badName" must be snake_case/);
  });

  it('accepts a person marker on a string field and preserves it', () => {
    const parsed = validateDocType(
      {
        ...wellFormed,
        fields: { patient: { label: 'Patient', type: 'string', person: true } },
      },
      'x.ts',
    );
    expect(parsed.fields.patient!.person).toBe(true);
  });

  it('rejects a person marker on a non-string field', () => {
    expect(() =>
      validateDocType(
        { ...wellFormed, fields: { amount: { label: 'Amount', type: 'number', person: true } } },
        'x.ts',
      ),
    ).toThrow(/person is only valid on a string field/);
  });

  it('rejects a non-boolean person marker', () => {
    expect(() =>
      validateDocType(
        { ...wellFormed, fields: { who: { label: 'Who', type: 'string', person: 'yes' } } },
        'x.ts',
      ),
    ).toThrow(/person must be a boolean/);
  });

  it('accepts a category and preserves it', () => {
    const parsed = validateDocType({ ...wellFormed, category: 'tax' }, 'x.ts');
    expect(parsed.category).toBe('tax');
  });

  it('omits category entirely when none is declared', () => {
    // Kept absent (not '') so `toEqual(wellFormed)` on an uncategorized type holds.
    expect(validateDocType(wellFormed, 'x.ts')).not.toHaveProperty('category');
  });

  it('rejects a non-kebab-case category', () => {
    expect(() => validateDocType({ ...wellFormed, category: 'Tax' }, 'x.ts')).toThrow(
      /must be a lowercase kebab-case string/,
    );
  });

  it('accepts an optional post_classify function and rejects a non-function', () => {
    const hook = () => Promise.resolve({ default: async () => undefined });
    expect(() =>
      validateDocType({ ...wellFormed, post_classify: hook }, 'x.ts'),
    ).not.toThrow();
    expect(() =>
      validateDocType({ ...wellFormed, post_classify: 'nope' }, 'x.ts'),
    ).toThrow(/post_classify must be a function/);
  });

  it('accepts a title_template and preserves it', () => {
    const parsed = validateDocType(
      { ...wellFormed, title_template: '1099 ({tax_year}) — {payer_name}' },
      'x.ts',
    );
    expect(parsed.title_template).toBe('1099 ({tax_year}) — {payer_name}');
  });

  it('omits title_template entirely when none is declared', () => {
    // Kept absent (not '') so `toEqual(wellFormed)` on a templateless type holds.
    expect(validateDocType(wellFormed, 'x.ts')).not.toHaveProperty('title_template');
  });

  it('rejects a non-string or empty title_template', () => {
    expect(() =>
      validateDocType({ ...wellFormed, title_template: 42 }, 'x.ts'),
    ).toThrow(/title_template, when set, must be a non-empty string/);
    expect(() =>
      validateDocType({ ...wellFormed, title_template: '   ' }, 'x.ts'),
    ).toThrow(/title_template, when set, must be a non-empty string/);
  });

  it('rejects a title_template with no placeholder', () => {
    expect(() =>
      validateDocType({ ...wellFormed, title_template: 'A constant title' }, 'x.ts'),
    ).toThrow(/must contain at least one \{placeholder\}/);
  });

  it('rejects a title_template with an unbalanced brace', () => {
    expect(() =>
      validateDocType({ ...wellFormed, title_template: '{payer_name} — {oops' }, 'x.ts'),
    ).toThrow(/unbalanced/);
  });

  it('rejects a non-snake_case title_template placeholder', () => {
    expect(() =>
      validateDocType({ ...wellFormed, title_template: '{payerName}' }, 'x.ts'),
    ).toThrow(/placeholder "\{payerName\}" must be snake_case/);
  });

  it('rejects a placeholder that points at a non-scalar field', () => {
    // A field-backed placeholder can only fill a title from a string/number
    // value; an array/object field never renders, so it's caught at authoring.
    expect(() =>
      validateDocType(
        {
          ...wellFormed,
          fields: { drivers: { label: 'Drivers', type: 'array', items: { label: 'D', type: 'string' } } },
          title_template: 'Policy — {drivers}',
        },
        'x.ts',
      ),
    ).toThrow(/refers to the array field "drivers"/);
  });

  it('accepts a free (non-field) placeholder the model will fill', () => {
    // {tax_year} isn't a declared field here — that's allowed: classify has the
    // model read it off the document during extraction.
    expect(() =>
      validateDocType(
        { ...wellFormed, title_template: '1099 ({tax_year}) — {payer_name}' },
        'x.ts',
      ),
    ).not.toThrow();
  });
});

describe('freeTitlePlaceholders', () => {
  it('returns the placeholders that are not declared fields, deduped in order', () => {
    const t = type('form-1099', {
      payer_name: { label: 'Payer', type: 'string' },
    });
    t.title_template = '1099 ({tax_year}) — {payer_name} ({tax_year})';
    // {payer_name} is a field (dropped); {tax_year} is free and deduped.
    expect(freeTitlePlaceholders(t)).toEqual(['tax_year']);
  });

  it('is empty for a type with no template', () => {
    expect(freeTitlePlaceholders(type('t', { a: { label: 'A', type: 'string' } }))).toEqual([]);
  });

  it('is empty when every placeholder is field-backed', () => {
    const t = type('t', { merchant: { label: 'Merchant', type: 'string' } });
    t.title_template = 'Receipt — {merchant}';
    expect(freeTitlePlaceholders(t)).toEqual([]);
  });
});

describe('renderTitleTemplate', () => {
  it('fills every placeholder from string and number values', () => {
    expect(
      renderTitleTemplate('1099-INT ({tax_year}) — {payer_name}', {
        tax_year: 2024,
        payer_name: 'Pecan Street Credit Union',
      }),
    ).toBe('1099-INT (2024) — Pecan Street Credit Union');
  });

  it('trims string values but renders numbers verbatim', () => {
    expect(renderTitleTemplate('{a} {b}', { a: '  x  ', b: 7 })).toBe('x 7');
  });

  it('returns null when any placeholder is missing, null, or blank', () => {
    const tpl = '{doc} — {who}';
    expect(renderTitleTemplate(tpl, { doc: 'Policy' })).toBeNull();
    expect(renderTitleTemplate(tpl, { doc: 'Policy', who: null })).toBeNull();
    expect(renderTitleTemplate(tpl, { doc: 'Policy', who: '   ' })).toBeNull();
  });

  it('returns null for a non-scalar placeholder value', () => {
    expect(renderTitleTemplate('{list}', { list: ['a', 'b'] })).toBeNull();
    expect(renderTitleTemplate('{n}', { n: Number.NaN })).toBeNull();
  });
});

describe('toVariants', () => {
  it('compiles doc types into FieldDef variants plus the unknown variant', () => {
    const variants = toVariants([
      type('form-w2', { wages: { label: 'Wages', type: 'number', description: 'Box 1.' } }),
    ]);
    expect(variants['form-w2']).toEqual({
      wages: { type: 'number', singular_name: 'Wages', description: 'Box 1.' },
    });
    // Unmatched documents are a real member of the union, carrying free-form facts.
    expect(Object.keys(variants[UNKNOWN_DOC_TYPE])).toEqual(['facts']);
    expect(variants[UNKNOWN_DOC_TYPE].facts).toMatchObject({
      type: 'array',
      items: { type: 'object', properties: { label: {}, value: {} } },
    });
  });

  it('rejects a doc type whose field collides with the unknown facts column', () => {
    expect(() =>
      toVariants([type('form-a', { facts: { label: 'Facts', type: 'string' } })]),
    ).toThrow(/"facts" is a string in doc type "form-a" but a array in "unknown"/);
  });

  it('compiles the built-in types alongside the unknown facts', () => {
    expect(() => toVariants(BUILTIN_DOC_TYPES)).not.toThrow();
  });

  it('allows a shared field name when the types agree', () => {
    expect(() =>
      toVariants([
        type('a', { amount: { label: 'Amount', type: 'number' } }),
        type('b', { amount: { label: 'Amount', type: 'number' } }),
      ]),
    ).not.toThrow();
  });

  it('rejects a shared field name whose type differs, naming both doc types', () => {
    expect(() =>
      toVariants([
        type('form-a', { amount: { label: 'Amount', type: 'number' } }),
        type('form-b', { amount: { label: 'Amount', type: 'string' } }),
      ]),
    ).toThrow(/"amount" is a number in doc type "form-a" but a string in "form-b"/);
  });

  it('compiles an array-of-object field into a nested FieldDef', () => {
    const variants = toVariants([
      type('recipe', {
        parsed_ingredients: {
          label: 'Ingredients',
          type: 'array',
          description: 'The list.',
          items: {
            label: 'Ingredient',
            type: 'object',
            properties: {
              item: { label: 'Item', type: 'string' },
              qty: { label: 'Qty', type: 'number' },
            },
          },
        },
      }),
    ]);
    expect(variants.recipe.parsed_ingredients).toEqual({
      type: 'array',
      singular_name: 'Ingredients',
      description: 'The list.',
      items: {
        type: 'object',
        singular_name: 'Ingredient',
        properties: {
          item: { type: 'string', singular_name: 'Item' },
          qty: { type: 'number', singular_name: 'Qty' },
        },
      },
    });
  });
});

describe('docTypeIds', () => {
  it('lists every type id, then the reserved unknown tag last', () => {
    // These become the classification enum — the whole classify schema, kept
    // tiny so it stays servable however many types exist.
    expect(
      docTypeIds([
        type('form-w2', { wages: { label: 'Wages', type: 'number' } }),
        type('form-1098', { interest: { label: 'Interest', type: 'number' } }),
      ]),
    ).toEqual(['form-w2', 'form-1098', UNKNOWN_DOC_TYPE]);
  });

  it('offers the unknown tag even with no types configured', () => {
    expect(docTypeIds([])).toEqual([UNKNOWN_DOC_TYPE]);
  });
});

describe('toExtractionSchema', () => {
  const schema = () =>
    toExtractionSchema(
      type('form-w2', {
        employer: { label: 'Employer', type: 'string' },
        wages: { label: 'Wages', type: 'number' },
      }),
    );

  it('accepts a full read — one type\'s fields, no discriminator', () => {
    // Extraction runs against the already-matched type, so the schema carries
    // its fields alone and re-attaching `doc_type` is the caller's job.
    expect(schema().parse({ employer: 'Acme', wages: 90000 })).toEqual({
      employer: 'Acme',
      wages: 90000,
    });
  });

  it('accepts a partial read — unfound fields are null, not omitted', () => {
    // Fields are `.nullable()`, not `.optional()`: the model emits every key,
    // using null for the ones it can't find (that is what keeps Gemini from
    // aborting the structured-output call). A null survives validation; an
    // omitted key does not, so classify strips the nulls itself.
    expect(schema().parse({ employer: 'Acme', wages: null })).toEqual({
      employer: 'Acme',
      wages: null,
    });
    expect(() => schema().parse({ employer: 'Acme' })).toThrow();
  });

  it('rejects a mistyped field', () => {
    expect(() => schema().parse({ employer: 'Acme', wages: '90000' })).toThrow();
  });

  it('parses a composite array-of-object field', () => {
    const recipe = toExtractionSchema(
      type('recipe', {
        parsed_ingredients: {
          label: 'Ingredients',
          type: 'array',
          items: {
            label: 'Ingredient',
            type: 'object',
            properties: {
              item: { label: 'Item', type: 'string' },
              qty: { label: 'Qty', type: 'number' },
            },
          },
        },
      }),
    );
    expect(
      recipe.parse({
        // A per-ingredient null models "unfound" — object props are nullable, so
        // this survives validation (classify/hook strip the nulls before storing).
        parsed_ingredients: [
          { item: 'flour', qty: 2 },
          { item: 'salt', qty: null },
        ],
      }),
    ).toEqual({
      parsed_ingredients: [
        { item: 'flour', qty: 2 },
        { item: 'salt', qty: null },
      ],
    });
    // The whole composite field is nullable too — a recipe with no list read.
    expect(recipe.parse({ parsed_ingredients: null })).toEqual({
      parsed_ingredients: null,
    });
  });
});

describe('the built-in doc types', () => {
  it('have globally-unique ids', () => {
    // ids become the union discriminator and the `getDocType` key, so a
    // collision would silently shadow one type. An invariant, not a snapshot:
    // adding a doc type needs no edit here — only a duplicate id fails it.
    const ids = BUILTIN_DOC_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('validate cleanly', () => {
    for (const t of BUILTIN_DOC_TYPES) {
      expect(() => validateDocType(t, `${t.id}.ts`)).not.toThrow();
    }
  });

  it('compile to variants without a field-type conflict', () => {
    // The tax forms deliberately share columns (payer_name, recipient_name,
    // box_4_federal_tax_withheld, ...); this guards that every type using a
    // shared name agrees on its type, and catches the next one that doesn't.
    expect(() => toVariants(BUILTIN_DOC_TYPES)).not.toThrow();
  });

  it('categorize every tax form as "tax"', () => {
    // The tax document types are one category — the taxonomy that groups them.
    // A tax form added without the category (or a typo'd one) falls out of the
    // group silently, so pin it here.
    const NON_FORM_TAX_IDS = [
      'schedule-k-1',
      'property-tax-statement',
      'charitable-donation-receipt',
      'estimated-tax-payment',
      'closing-disclosure',
      'childcare-provider-statement',
    ];
    const taxForms = BUILTIN_DOC_TYPES.filter(
      (t) => t.id.startsWith('form-') || NON_FORM_TAX_IDS.includes(t.id),
    );
    for (const t of taxForms) {
      expect(t.category, t.id).toBe('tax');
    }
  });

  it('carry a description on every field — the lever on extraction quality', () => {
    for (const t of BUILTIN_DOC_TYPES) {
      for (const [name, field] of Object.entries(t.fields)) {
        expect(field.description, `${t.id}.${name}`).toBeTruthy();
      }
    }
  });

  it('carry an icon', () => {
    for (const t of BUILTIN_DOC_TYPES) {
      expect(typeof t.icon, t.id).toBe('function');
    }
  });
});

describe('toUnknownExtractionSchema', () => {
  it('reads label/value pairs, tolerating null halves for readFacts to drop', () => {
    const read = toUnknownExtractionSchema().parse({
      facts: [
        { label: 'Model Number', value: 'WRF555SDFZ' },
        { label: 'Serial', value: null },
      ],
    });
    expect(read.facts).toHaveLength(2);
  });

  it('accepts a null list — the document showed nothing worth keeping', () => {
    expect(toUnknownExtractionSchema().parse({ facts: null })).toEqual({ facts: null });
  });
});

describe('readFacts', () => {
  it('keeps trimmed label/value pairs in order', () => {
    expect(
      readFacts([
        { label: ' Paint Color Code ', value: ' SW 7006 ' },
        { label: 'Brand', value: 'Sherwin-Williams' },
      ]),
    ).toEqual([
      { label: 'Paint Color Code', value: 'SW 7006' },
      { label: 'Brand', value: 'Sherwin-Williams' },
    ]);
  });

  it('drops entries missing a label or value, and repeats', () => {
    expect(
      readFacts([
        { label: 'Serial', value: null },
        { label: '', value: 'x' },
        { label: 'Model', value: '   ' },
        'not an object',
        null,
        { label: 'Model', value: 'A1' },
        { label: 'model', value: 'a1' },
      ]),
    ).toEqual([{ label: 'Model', value: 'A1' }]);
  });

  it('reads anything that is not a list as no facts', () => {
    expect(readFacts(undefined)).toEqual([]);
    expect(readFacts(null)).toEqual([]);
    expect(readFacts({ label: 'Model', value: 'A1' })).toEqual([]);
  });

  it('caps a long list', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `Fact ${i}`, value: `${i}` }));
    expect(readFacts(many)).toHaveLength(20);
  });
});

describe('replaceMetadata', () => {
  it('nulls every stored key the new metadata leaves out, so the merge drops it', () => {
    expect(
      replaceMetadata(
        { doc_type: 'unknown', facts: [{ label: 'Model', value: 'A1' }] },
        { doc_type: 'warranty', product: 'Fridge' },
      ),
    ).toEqual({ doc_type: 'warranty', product: 'Fridge', facts: null });
  });

  it('sends the new metadata as-is when nothing was stored', () => {
    expect(replaceMetadata(undefined, { doc_type: 'unknown' })).toEqual({ doc_type: 'unknown' });
  });
});
