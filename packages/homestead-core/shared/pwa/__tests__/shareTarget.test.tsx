import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { SHARE_CACHE, takeSharedFiles, useSharedFiles } from '../shareTarget';

/** The slice of Cache Storage the share target uses, in memory. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    const key = (r: RequestInfo | URL) => new URL(String(r instanceof Request ? r.url : r), 'http://h').href;
    return {
      put: async (r: RequestInfo, res: Response) => void store.set(key(r), res),
      match: async (r: RequestInfo) => store.get(key(r)),
      delete: async (r: RequestInfo) => store.delete(key(r)),
      keys: async () => [...store.keys()].map((url) => new Request(url)),
    };
  };
  return { open, stores };
}

function park(cache: Awaited<ReturnType<ReturnType<typeof fakeCaches>['open']>>, id: string, i: number, name: string, body: string, type: string) {
  return cache.put(
    `/__shared/${id}/${i}`,
    new Response(body, { headers: { 'content-type': type, 'x-filename': encodeURIComponent(name) } }),
  );
}

let caches: ReturnType<typeof fakeCaches>;

beforeEach(() => {
  caches = fakeCaches();
  vi.stubGlobal('caches', caches);
});

afterEach(() => vi.unstubAllGlobals());

describe('takeSharedFiles', () => {
  it('returns one share’s files in order and removes them', async () => {
    const cache = await caches.open(SHARE_CACHE);
    // Ten files, so index 10 must sort after 2, not between 1 and 2.
    for (let i = 10; i >= 0; i -= 1) await park(cache, 'abc', i, `f${i}.pdf`, `#${i}`, 'application/pdf');
    await park(cache, 'other', 0, 'keep.jpg', 'x', 'image/jpeg');

    const files = await takeSharedFiles('abc');

    expect(files.map((f) => f.name)).toEqual(Array.from({ length: 11 }, (_, i) => `f${i}.pdf`));
    expect(files[0].type).toBe('application/pdf');
    expect(await files[3].text()).toBe('#3');
    expect(await takeSharedFiles('abc')).toEqual([]);
    expect(await takeSharedFiles('other')).toHaveLength(1);
  });

  it('decodes names and ignores a malformed id', async () => {
    const cache = await caches.open(SHARE_CACHE);
    await park(cache, 'abc', 0, 'Boarding pass – LHR.pdf', 'x', 'application/pdf');
    expect(await takeSharedFiles('../abc')).toEqual([]);
    expect((await takeSharedFiles('abc'))[0].name).toBe('Boarding pass – LHR.pdf');
  });

  it('is empty without Cache Storage', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await takeSharedFiles('abc')).toEqual([]);
  });
});

describe('useSharedFiles', () => {
  function Probe({ onFiles }: { onFiles: (files: File[]) => void }) {
    useSharedFiles(onFiles);
    const location = useLocation();
    return <span data-testid="search">{location.search}</span>;
  }

  it('hands a share over once and drops it from the address', async () => {
    const cache = await caches.open(SHARE_CACHE);
    await park(cache, 'abc', 0, 'ticket.pdf', 'x', 'application/pdf');
    const onFiles = vi.fn();

    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/documents?chrome=none&shared=abc']}>
        <Probe onFiles={onFiles} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(onFiles).toHaveBeenCalledOnce());
    expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['ticket.pdf']);
    expect(getByTestId('search').textContent).toBe('?chrome=none');
  });

  it('does nothing when the share is already gone', async () => {
    const onFiles = vi.fn();
    const looked = vi.fn();
    const open = caches.open;
    vi.stubGlobal('caches', {
      open: async (name: string) => {
        const cache = await open(name);
        return { ...cache, keys: async () => (looked(), cache.keys()) };
      },
    });
    const { getByTestId } = render(
      <MemoryRouter initialEntries={['/documents?shared=gone']}>
        <Probe onFiles={onFiles} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(looked).toHaveBeenCalled());
    await Promise.resolve();
    expect(onFiles).not.toHaveBeenCalled();
    expect(getByTestId('search').textContent).toBe('');
  });
});
