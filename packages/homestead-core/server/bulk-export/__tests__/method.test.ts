import { afterEach, describe, expect, it } from 'vitest';
import {
  initializeAppRegistry,
  resetAppRegistry,
} from '../../../apps/registry';
import {
  allBulkExportCustomMethods,
  bulkExportCustomMethod,
  bulkExportFormatInfo,
  BULK_EXPORT_VERB,
} from '../method';
import { createCsvSerializer } from '../csv';
import type { AppConfig } from '../../../apps/types';
import type { ResourceDefinition } from '../../../resources/types';

function appWith(def: ResourceDefinition): AppConfig {
  return { id: 'things', name: 'Things', description: 'test', resources: [def] };
}

const thingDef: ResourceDefinition = {
  singular: 'thing',
  plural: 'things',
  fields: { name: { type: 'string', required: true } },
  bulkExport: {
    formats: [
      {
        id: 'csv',
        label: 'CSV',
        mimeType: 'text/csv',
        extension: 'csv',
        load: async () => ({ default: createCsvSerializer(['name']) }),
      },
    ],
  },
};

afterEach(() => resetAppRegistry());

describe('bulkExportCustomMethod', () => {
  it('synthesizes a read-only GET collection method for a resource that opts in', () => {
    initializeAppRegistry([appWith(thingDef)]);
    const method = bulkExportCustomMethod('things', BULK_EXPORT_VERB);
    expect(method).toMatchObject({ target: 'collection', method: 'GET' });
    // A download is a read: no operation, so it isn't async.
    expect(method?.async).toBeUndefined();
  });

  it('returns undefined for the wrong verb', () => {
    initializeAppRegistry([appWith(thingDef)]);
    expect(bulkExportCustomMethod('things', 'bulk-import')).toBeUndefined();
  });

  it('returns undefined for a resource that does not opt in', () => {
    initializeAppRegistry([
      appWith({ singular: 'plain', plural: 'plains', fields: {} }),
    ]);
    expect(bulkExportCustomMethod('plains', BULK_EXPORT_VERB)).toBeUndefined();
  });
});

describe('allBulkExportCustomMethods', () => {
  it('keys every opted-in resource by "<plural>:bulk-export"', () => {
    initializeAppRegistry([appWith(thingDef)]);
    expect(Object.keys(allBulkExportCustomMethods())).toEqual(['things:bulk-export']);
  });
});

describe('bulkExportFormatInfo', () => {
  it('surfaces format metadata plus the serializer columns, dropping load', async () => {
    initializeAppRegistry([appWith(thingDef)]);
    const info = await bulkExportFormatInfo('things');
    expect(info).toEqual([
      {
        id: 'csv',
        label: 'CSV',
        mime_type: 'text/csv',
        extension: 'csv',
        columns: [{ name: 'name', description: undefined }],
      },
    ]);
  });

  it('is undefined for a resource without bulk export', async () => {
    initializeAppRegistry([
      appWith({ singular: 'plain', plural: 'plains', fields: {} }),
    ]);
    expect(await bulkExportFormatInfo('plains')).toBeUndefined();
  });
});
