import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BulkImportDef } from '../../../resources/bulk-import/types';

const def: BulkImportDef = {
  formats: [
    { id: 'csv', label: 'CSV', inputType: 'file', load: async () => ({ default: { parse: () => [] } }) },
    {
      id: 'photo',
      label: 'Photo',
      inputType: 'file',
      description: 'Upload a photo.',
      requiresAi: true,
      load: async () => ({ default: { parse: () => [] } }),
    },
  ],
};

vi.mock('../../../apps/registry', () => ({
  getResourceBulkImport: () => def,
  getAllResourceBulkImports: () => ({ things: def }),
  getAllResourceDefs: () => [],
}));
vi.mock('../../ai/config', () => ({ isAiConfigured: vi.fn() }));

import { encodeMethodBody } from '@rambleraptor/homestead-client';
import { isAiConfigured } from '../../ai/config';
import { bulkImportFormatInfo } from '../method';
import { validate } from '../handler';

const aiReady = vi.mocked(isAiConfigured);

function ctxFor(body: Record<string, unknown>) {
  const encoded = encodeMethodBody(body);
  return {
    plural: 'things',
    request: new Request('http://x/things:bulk-import', {
      method: 'POST',
      ...(encoded instanceof FormData
        ? { body: encoded }
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(encoded) }),
    }),
  } as never;
}

const csv = () => [new File(['name\nx'], 'a.csv', { type: 'text/csv' })];

beforeEach(() => aiReady.mockReset());

describe('formats that require AI', () => {
  it('are offered, with their description, when AI is configured', async () => {
    aiReady.mockReturnValue(true);
    const formats = await bulkImportFormatInfo('things');
    expect(formats?.map((f) => f.id)).toEqual(['csv', 'photo']);
    expect(formats?.[1].description).toBe('Upload a photo.');
    expect(formats?.[0]).not.toHaveProperty('description');
  });

  it('are left out of the list when AI is not configured', async () => {
    aiReady.mockReturnValue(false);
    const formats = await bulkImportFormatInfo('things');
    expect(formats?.map((f) => f.id)).toEqual(['csv']);
  });

  it('are refused with a 503 before an operation starts', async () => {
    aiReady.mockReturnValue(false);
    const res = await validate(ctxFor({ format: 'photo', files: csv() }));
    expect(res?.status).toBe(503);
    expect(await validate(ctxFor({ format: 'csv', files: csv() }))).toBeUndefined();
  });
});
