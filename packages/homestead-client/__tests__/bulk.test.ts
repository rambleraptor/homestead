import { describe, expect, it } from 'vitest';
import { bearerToken, createHomesteadClient, HomesteadError, OperationFailedError } from '../index';
import { jsonBody, mockFetch, type RecordedCall } from './helpers';

const PREVIEW = {
  validate_only: true,
  preview_id: 'p1',
  items: [{ index: 0, data: { title: 'Rice' }, errors: [], warnings: [] }],
  summary: { total: 1, valid: 1, invalid: 0 },
};
const RESULT = { validate_only: false, created: 1, failed: [], summary: PREVIEW.summary };

/** Answers the import POST with an operation, then the operation as done with `response`. */
function server(response: unknown) {
  return mockFetch((call: RecordedCall) =>
    call.method === 'POST'
      ? { status: 202, json: { id: 'op1', done: false } }
      : { json: { id: 'op1', done: true, response } },
  );
}

describe('bulkImport', () => {
  it('previews a text format as JSON with validate_only, then reads the operation', async () => {
    const mock = server(PREVIEW);
    const hs = createHomesteadClient({ auth: bearerToken('t', 'u1'), fetch: mock.fetch });

    const preview = await hs
      .collection('recipes')
      .bulkImport.preview({ format: 'social', text: 'https://youtu.be/x' }, { intervalMs: 1 });

    expect(preview.preview_id).toBe('p1');
    expect(mock.calls[0].url).toBe('/api/aep/recipes:bulk-import');
    expect(mock.calls[0].headers['X-User-Id']).toBe('u1');
    expect(jsonBody(mock.calls[0])).toEqual({
      format: 'social',
      text: 'https://youtu.be/x',
      validate_only: true,
    });
    expect(mock.calls[1].url).toBe('/api/aep/operations/op1');
  });

  it('sends files as multipart $upload parts', async () => {
    const mock = server(PREVIEW);
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });
    const file = new File(['bytes'], 'a.paprikarecipe');

    await hs.collection('recipes').bulkImport.preview({ format: 'paprika', files: [file] }, { intervalMs: 1 });

    const form = mock.calls[0].body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(JSON.parse(form.get('body') as string)).toEqual({
      format: 'paprika',
      files: [{ $upload: '$upload-0' }],
      validate_only: true,
    });
    expect((form.get('$upload-0') as File).name).toBe('a.paprikarecipe');
  });

  it('imports a preview by id with the selected rows, re-sending no input', async () => {
    const mock = server(RESULT);
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });

    const result = await hs
      .collection('recipes')
      .bulkImport.importPreview({ format: 'social', previewId: 'p1', selected: [0] }, { intervalMs: 1 });

    expect(result.created).toBe(1);
    expect(jsonBody(mock.calls[0])).toEqual({ format: 'social', preview_id: 'p1', selected_indices: [0] });
  });

  it('runs parse-and-write in one call', async () => {
    const mock = server(RESULT);
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });

    await hs.collection('recipes').bulkImport.run({ format: 'text', text: 'Rice' }, { intervalMs: 1 });

    expect(jsonBody(mock.calls[0])).toEqual({ format: 'text', text: 'Rice' });
  });

  it("throws the operation's problem detail when it fails", async () => {
    const mock = mockFetch((call) =>
      call.method === 'POST'
        ? { status: 202, json: { id: 'op1', done: false } }
        : { json: { id: 'op1', done: true, error: { status: 410, detail: 'This preview has expired' } } },
    );
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });

    const err = await hs
      .collection('recipes')
      .bulkImport.importPreview({ format: 'social', previewId: 'gone' }, { intervalMs: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OperationFailedError);
    expect((err as Error).message).toBe('This preview has expired');
  });

  it('surfaces a refused request (no operation) as a HomesteadError', async () => {
    const mock = mockFetch(() => ({
      status: 410,
      json: { status: 410, detail: 'gone', error: { code: 410, message: 'gone' } },
    }));
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });

    const err = await hs
      .collection('recipes')
      .bulkImport.importPreview({ format: 'social', previewId: 'gone' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HomesteadError);
    expect((err as HomesteadError).code).toBe(410);
  });
});

describe('bulkExport', () => {
  it('GETs the export with format, filter and options as query params', async () => {
    const mock = mockFetch(() => ({ text: 'name\nAda\n' }));
    const hs = createHomesteadClient({ auth: bearerToken('t', 'u1'), fetch: mock.fetch });

    const blob = await hs.collection('people').bulkExport({
      format: 'csv',
      filter: 'id in ["a"]',
      options: { combine_households: true },
    });

    expect(await blob.text()).toBe('name\nAda\n');
    const url = new URL(mock.calls[0].url, 'http://x');
    expect(url.pathname).toBe('/api/aep/people:bulk-export');
    expect(url.searchParams.get('format')).toBe('csv');
    expect(url.searchParams.get('filter')).toBe('id in ["a"]');
    expect(url.searchParams.get('combine_households')).toBe('true');
    expect(mock.calls[0].method).toBe('GET');
  });
});
