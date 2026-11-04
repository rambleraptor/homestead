import { describe, expect, it } from 'vitest';
import {
  createCsvParser,
  parseCsv,
  parseCsvRecords,
  validateEnum,
  validateNumber,
  validateOptionalString,
  type CsvSchema,
} from '../csv';

const schema: CsvSchema<Record<string, unknown>> = {
  requiredFields: [
    { name: 'merchant', required: true, validator: (value) => ({ value }) },
  ],
  optionalFields: [
    { name: 'notes', required: false, validator: validateOptionalString(10) },
    { name: 'balance', required: false, validator: validateNumber({ min: 0 }) },
    {
      name: 'status',
      required: false,
      validator: validateEnum(['pending', 'done']),
      defaultValue: 'pending',
    },
  ],
  template: () => 'merchant,notes\n',
};

describe('parseCsvRecords', () => {
  it('keeps a newline inside a quoted field as data, not a record break', () => {
    // The old client-side parser split on \n first, silently mangling any row
    // with a multi-line note. This is the regression that motivated the port.
    const records = parseCsvRecords('a,b\n"line one\nline two",second\n');
    expect(records).toEqual([
      ['a', 'b'],
      ['line one\nline two', 'second'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsvRecords('"he said ""hi""",x')).toEqual([['he said "hi"', 'x']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsvRecords('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps a final record with no trailing newline', () => {
    expect(parseCsvRecords('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsvRecords('')).toEqual([]);
  });
});

describe('parseCsv', () => {
  it('indexes items from zero and applies defaults', () => {
    const items = parseCsv('merchant,notes\nAmazon,gift\nTarget,\n', schema);
    expect(items.map((i) => i.index)).toEqual([0, 1]);
    expect(items[0].data).toEqual({ merchant: 'Amazon', notes: 'gift', status: 'pending' });
    expect(items[1].data).toEqual({ merchant: 'Target', status: 'pending' });
    expect(items.every((i) => i.errors.length === 0)).toBe(true);
  });

  it('reports a missing required column as one errored item, not a throw', () => {
    // Fatal for the file, but a sibling file in the same import must survive.
    const items = parseCsv('notes\nhello\n', schema, 'cards.csv');
    expect(items).toHaveLength(1);
    expect(items[0].errors[0]).toContain('merchant');
    expect(items[0].label).toBe('cards.csv');
  });

  it('marks a row invalid without affecting its neighbours', () => {
    const items = parseCsv('merchant,notes\nAmazon,ok\n,orphan\nTarget,ok\n', schema);
    expect(items).toHaveLength(3);
    expect(items[0].errors).toEqual([]);
    expect(items[1].errors).toEqual(['merchant is required']);
    expect(items[2].errors).toEqual([]);
  });

  it('collects validator errors per field', () => {
    const items = parseCsv('merchant,notes,balance\nAmazon,way too long to fit,abc\n', schema);
    expect(items[0].errors).toEqual([
      'must be 10 characters or fewer',
      'must be a number',
    ]);
  });

  it('skips blank lines', () => {
    const items = parseCsv('merchant\nAmazon\n\nTarget\n', schema);
    expect(items.map((i) => i.data.merchant)).toEqual(['Amazon', 'Target']);
  });

  it('runs transformParsed only on valid rows', () => {
    const withTransform: CsvSchema<{ name: string }> = {
      ...schema,
      transformParsed: (raw) => ({ name: String(raw.merchant).toUpperCase() }),
    };
    const items = parseCsv('merchant\nAmazon\n\n', withTransform);
    expect(items[0].data).toEqual({ name: 'AMAZON' });
  });
});

describe('createCsvParser', () => {
  const ctx = {
    auth: { token: 't', user: { id: 'u', path: 'users/u', email: 'e' } },
    plural: 'gift-cards',
    format: 'csv',
  };

  it('merges rows across multiple files', async () => {
    const parser = createCsvParser(schema);
    const encode = (s: string) => new TextEncoder().encode(s);
    const items = await parser.parse(
      {
        files: [
          { name: 'a.csv', bytes: encode('merchant\nAmazon\n') },
          { name: 'b.csv', bytes: encode('merchant\nTarget\n') },
        ],
      },
      ctx,
    );
    expect(items.map((i) => i.data.merchant)).toEqual(['Amazon', 'Target']);
  });
});

describe('validateEnum', () => {
  it('matches case-insensitively and normalizes to the declared casing', () => {
    expect(validateEnum(['pending', 'done'])('DONE', {})).toEqual({ value: 'done' });
  });

  it('errors listing the allowed values', () => {
    expect(validateEnum(['pending', 'done'])('nope', {}).error).toBe(
      'must be one of: pending, done',
    );
  });
});
