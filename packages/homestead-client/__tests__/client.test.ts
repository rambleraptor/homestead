import { describe, it, expect } from 'vitest';
import {
  createHomesteadClient,
  normalizeBaseUrl,
  bearerToken,
  HomesteadError,
} from '../index';
import { mockFetch, jsonBody, type MockResponse } from './helpers';

describe('normalizeBaseUrl', () => {
  it('defaults to same-origin /api/aep', () => {
    expect(normalizeBaseUrl('')).toBe('/api/aep');
  });
  it('appends /api/aep to a bare origin', () => {
    expect(normalizeBaseUrl('https://home.example.com')).toBe(
      'https://home.example.com/api/aep',
    );
  });
  it('is idempotent when the suffix is already present', () => {
    expect(normalizeBaseUrl('https://x/api/aep')).toBe('https://x/api/aep');
    expect(normalizeBaseUrl('https://x/api/aep/')).toBe('https://x/api/aep');
  });
});

describe('CRUD', () => {
  it('gets a record at the right path with a bearer token', async () => {
    const mock = mockFetch(() => ({ json: { id: 'abc', merchant: 'REI' } }));
    const hs = createHomesteadClient({
      baseUrl: 'https://x',
      auth: bearerToken('tok'),
      fetch: mock.fetch,
    });
    const card = await hs.collection('gift-cards').get('abc');
    expect(card).toEqual({ id: 'abc', merchant: 'REI' });
    expect(mock.calls[0].url).toBe('https://x/api/aep/gift-cards/abc');
    expect(mock.calls[0].headers.Authorization).toBe('Bearer tok');
  });

  it('creates via POST with a JSON body', async () => {
    const mock = mockFetch((c) => ({ status: 201, json: { id: 'new', ...(jsonBody(c) as object) } }));
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });
    const made = await hs.collection('gift-cards').create({ merchant: 'REI' });
    expect(made).toMatchObject({ id: 'new', merchant: 'REI' });
    expect(mock.calls[0].method).toBe('POST');
    expect(mock.calls[0].headers['Content-Type']).toBe('application/json');
    expect(jsonBody(mock.calls[0])).toEqual({ merchant: 'REI' });
  });

  it('updates with merge-patch and deletes with force', async () => {
    const mock = mockFetch(() => ({ status: 204 }));
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });
    const rec = hs.collection('gift-cards').record('abc');
    await rec.update({ balance: 40 });
    await rec.delete({ force: true });

    expect(mock.calls[0].method).toBe('PATCH');
    expect(mock.calls[0].headers['Content-Type']).toBe('application/merge-patch+json');
    expect(mock.calls[1].method).toBe('DELETE');
    expect(mock.calls[1].url).toContain('force=true');
  });

  it('addresses nested child collections', async () => {
    const mock = mockFetch(() => ({ json: { results: [] } }));
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });
    await hs.collection('gift-cards').record('abc').collection('transactions').listAll();
    expect(mock.calls[0].url).toContain('/api/aep/gift-cards/abc/transactions');
  });
});

describe('pagination', () => {
  it('follows next_page_token across pages', async () => {
    const pages: MockResponse[] = [
      { json: { results: [{ id: '1' }, { id: '2' }], next_page_token: 'p2' } },
      { json: { results: [{ id: '3' }] } },
    ];
    let i = 0;
    const mock = mockFetch(() => pages[i++]!);
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });
    const all = await hs.collection<{ id: string }>('gift-cards').listAll();
    expect(all.map((r) => r.id)).toEqual(['1', '2', '3']);
    expect(mock.calls[1].url).toContain('page_token=p2');
  });
});

describe('custom methods', () => {
  it('posts a collection verb with X-User-Id', async () => {
    const mock = mockFetch(() => ({ json: { ok: true } }));
    const hs = createHomesteadClient({
      auth: bearerToken('t', 'user-1'),
      fetch: mock.fetch,
    });
    await hs.collection('groceries').invoke('process-image', { image: 'x' });
    expect(mock.calls[0].url).toBe('/api/aep/groceries:process-image');
    expect(mock.calls[0].headers['X-User-Id']).toBe('user-1');
  });

  it('posts an item verb on a record', async () => {
    const mock = mockFetch(() => ({ json: {} }));
    const hs = createHomesteadClient({ auth: bearerToken('t', 'u'), fetch: mock.fetch });
    await hs.collection('hsa-receipts').record('r1').invoke('parse-receipt');
    expect(mock.calls[0].url).toBe('/api/aep/hsa-receipts/r1:parse-receipt');
  });
});

describe('file upload', () => {
  it('assembles multipart when the body has a Blob field', async () => {
    const mock = mockFetch(() => ({ status: 201, json: { id: 'x' } }));
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });
    const file = new Blob(['bytes'], { type: 'image/png' });
    await hs.collection('gift-cards').create({ merchant: 'REI', front_image: file });

    const body = mock.calls[0].body;
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get('merchant')).toBe('REI');
    expect(form.get('front_image')).toBeInstanceOf(Blob);
    // Multipart must not carry the JSON content type (boundary is auto-set).
    expect(mock.calls[0].headers['Content-Type']).toBeUndefined();
  });

  it('turns Blobs below the top level into upload placeholders', async () => {
    const mock = mockFetch(() => ({ status: 201, json: { id: 'x' } }));
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });
    const a = new Blob(['a']);
    const b = new Blob(['b']);
    const c = new Blob(['c']);
    await hs.collection('scrapbooks').create({
      title: 'Trip',
      attachments: [a, b],
      pages: [{ caption: 'front', scan: c }],
      note: null,
    });

    const form = mock.calls[0].body as FormData;
    expect(JSON.parse(form.get('attachments') as string)).toEqual([
      { $upload: '$upload-0' },
      { $upload: '$upload-1' },
    ]);
    expect(JSON.parse(form.get('pages') as string)).toEqual([
      { caption: 'front', scan: { $upload: '$upload-2' } },
    ]);
    expect(await (form.get('$upload-1') as Blob).text()).toBe('b');
    expect(await (form.get('$upload-2') as Blob).text()).toBe('c');
    expect(form.has('note')).toBe(false);
  });
});

describe('errors', () => {
  it('throws HomesteadError with the engine code + message', async () => {
    const mock = mockFetch(() => ({
      status: 404,
      json: { error: { code: 404, message: 'not found' } },
    }));
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });
    await expect(hs.collection('gift-cards').get('missing')).rejects.toMatchObject({
      code: 404,
      message: 'not found',
    });
    await expect(hs.collection('gift-cards').get('missing')).rejects.toBeInstanceOf(
      HomesteadError,
    );
  });
});

describe('download', () => {
  it('POSTs :download and returns a Blob', async () => {
    const mock = mockFetch(() => ({ text: 'raw-bytes' }));
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });
    const blob = await hs.collection('gift-cards').record('abc').download('front_image');
    expect(mock.calls[0].url).toBe('/api/aep/gift-cards/abc:download');
    expect(jsonBody(mock.calls[0])).toEqual({ field: 'front_image' });
    expect(await blob.text()).toBe('raw-bytes');
  });

  it('names a file below the top level by id, or by its descriptor', async () => {
    const mock = mockFetch(() => ({ text: 'raw-bytes' }));
    const hs = createHomesteadClient({ auth: bearerToken('t'), fetch: mock.fetch });
    const record = hs.collection('scrapbooks').record('s1');
    await record.download({ file: 'f1' });
    await record.download({
      id: 'f2',
      url: '/scrapbooks/s1:download?file=f2',
      name: 'a.png',
      media_type: 'image/png',
      size: 3,
      encrypted: false,
    });
    expect(jsonBody(mock.calls[0])).toEqual({ file: 'f1' });
    expect(jsonBody(mock.calls[1])).toEqual({ file: 'f2' });
  });
});
