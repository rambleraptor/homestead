/**
 * Files below a record's top level — in a list, inside an object, in a list of
 * objects. See `src/engine/file-entries.ts` and docs/design/nested-files.md.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { call, defineResource, makeEngine, type TestEngine } from './helpers';
import { filePath, storedFilePath } from '../../src/engine/files';
import { __resetMasterKeyCacheForTests } from '../../src/engine/crypto';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode('%PDF-1.7 fake');
const TEXT = new TextEncoder().encode('just some notes');

interface Descriptor {
  id: string;
  url: string;
  name: string;
  media_type: string;
  size: number;
  encrypted: boolean;
}

let t: TestEngine;

beforeEach(async () => {
  t = await makeEngine();
  const res = await defineResource(t, {
    singular: 'scrapbook',
    plural: 'scrapbooks',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        cover: { type: 'binary', 'x-aepbase-file-field': true },
        attachments: {
          type: 'array',
          maxItems: 3,
          items: { type: 'binary', 'x-aepbase-file-field': true },
        },
        profile: {
          type: 'object',
          properties: {
            bio: { type: 'string' },
            avatar: { type: 'binary', 'x-aepbase-file-field': true },
          },
        },
        pages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              caption: { type: 'string' },
              scan: { type: 'binary', 'x-aepbase-file-field': true },
            },
          },
        },
      },
      required: ['title'],
    },
  });
  expect(res.status).toBe(200);
});

/** A multipart body: a `resource` JSON part plus named file parts. */
function form(
  resource: Record<string, unknown> | null,
  files: Array<[part: string, bytes: Uint8Array<ArrayBuffer>, filename: string, type?: string]>,
): FormData {
  const f = new FormData();
  if (resource) f.append('resource', JSON.stringify(resource));
  for (const [part, bytes, filename, type] of files) {
    f.append(part, new Blob([bytes], { type: type ?? '' }), filename);
  }
  return f;
}

async function create(id: string, body: FormData) {
  return call(t.engine, 'POST', `/scrapbooks?id=${id}`, { token: t.adminToken, form: body });
}

async function download(id: string, body: unknown, query = '') {
  return call(t.engine, 'POST', `/scrapbooks/${id}:download${query}`, {
    token: t.adminToken,
    body,
  });
}

const onDisk = (record: string, fileId: string) =>
  existsSync(storedFilePath(t.filesDir, `scrapbooks/${record}`, fileId));

const storedIds = (record: string): string[] => {
  const dir = storedFilePath(t.filesDir, `scrapbooks/${record}`, 'x').replace(/\/x$/, '');
  return existsSync(dir) ? readdirSync(dir) : [];
};

describe('writing files below the top level', () => {
  test('repeated parts fill a top-level list, in order, and read back as descriptors', async () => {
    const res = await create(
      's1',
      form({ title: 'Trip' }, [
        ['attachments', PNG, 'beach.png', 'image/png'],
        ['attachments', PDF, 'tickets.pdf', 'application/pdf'],
      ]),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { attachments: Descriptor[] };
    expect(body.attachments).toHaveLength(2);
    const [beach, tickets] = body.attachments;
    expect(beach).toMatchObject({ name: 'beach.png', media_type: 'image/png', size: PNG.length, encrypted: false });
    expect(tickets).toMatchObject({ name: 'tickets.pdf', media_type: 'application/pdf' });
    expect(beach!.url).toBe(`http://localhost:8090/scrapbooks/s1:download?file=${beach!.id}`);
    expect(beach!.id).not.toBe(tickets!.id);
    expect(onDisk('s1', beach!.id)).toBe(true);

    // A read returns the same descriptors.
    const read = await (await call(t.engine, 'GET', '/scrapbooks/s1', { token: t.adminToken })).json();
    expect(read.attachments).toEqual(body.attachments);
  });

  test('placeholders put uploads inside objects and lists of objects', async () => {
    const res = await create(
      's2',
      form(
        {
          title: 'Album',
          profile: { bio: 'hi', avatar: { $upload: 'me' } },
          pages: [
            { caption: 'front', scan: { $upload: 'p0' } },
            { caption: 'blank', scan: null },
          ],
        },
        [
          ['me', PNG, 'me.png'],
          ['p0', PDF, 'front.pdf'],
        ],
      ),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.profile.bio).toBe('hi');
    expect(body.profile.avatar).toMatchObject({ name: 'me.png', media_type: 'image/png' });
    expect(body.pages[0]).toMatchObject({ caption: 'front', scan: { name: 'front.pdf' } });
    expect(body.pages[1]).toEqual({ caption: 'blank', scan: null });
  });

  test('a file is typed by its bytes, not by what the upload claims', async () => {
    const res = await create(
      's3',
      form({ title: 'x' }, [
        ['attachments', PNG, 'sneaky.pdf', 'application/pdf'],
        ['attachments', TEXT, 'fake.png', 'image/png'],
        ['attachments', TEXT, 'notes.txt', 'text/plain; charset=utf-8'],
      ]),
    );
    const { attachments } = (await res.json()) as { attachments: Descriptor[] };
    expect(attachments.map((a) => a.media_type)).toEqual([
      'image/png',
      'application/octet-stream',
      'text/plain',
    ]);
  });

  test('a top-level file field still works beside them', async () => {
    const res = await create(
      's4',
      form({ title: 'x' }, [
        ['cover', PNG, 'cover.png'],
        ['attachments', PDF, 'a.pdf'],
      ]),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.cover).toBe('http://localhost:8090/scrapbooks/s4:download?field=cover');
    expect(body.attachments).toHaveLength(1);
    expect(existsSync(filePath(t.filesDir, 'scrapbooks/s4', 'cover'))).toBe(true);
  });

  test('a list keeps its declared limits', async () => {
    const res = await create(
      's5',
      form({ title: 'x' }, [
        ['attachments', PNG, '1.png'],
        ['attachments', PNG, '2.png'],
        ['attachments', PNG, '3.png'],
        ['attachments', PNG, '4.png'],
      ]),
    );
    expect(res.status).toBe(400);
    expect(storedIds('s5')).toEqual([]);
  });
});

describe('refusing writes that would point at the wrong bytes', () => {
  test('a client cannot write a file entry itself', async () => {
    const res = await call(t.engine, 'POST', '/scrapbooks?id=r1', {
      token: t.adminToken,
      body: {
        title: 'x',
        profile: { avatar: { id: 'abc', name: 'a.png', media_type: 'image/png', size: 1, encrypted: false } },
      },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/"profile\.avatar" holds a file/);
  });

  test('$file must be a file this record already holds', async () => {
    const other = await (
      await create('r2', form({ title: 'other' }, [['attachments', PNG, 'theirs.png']]))
    ).json();
    const theirs = (other.attachments as Descriptor[])[0]!.id;

    const res = await call(t.engine, 'POST', '/scrapbooks?id=r3', {
      token: t.adminToken,
      body: { title: 'thief', attachments: [{ $file: theirs }] },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/doesn't have/);

    const patch = await call(t.engine, 'POST', '/scrapbooks?id=r4', {
      token: t.adminToken,
      body: { title: 'mine' },
    });
    expect(patch.status).toBe(201);
    const steal = await call(t.engine, 'PATCH', '/scrapbooks/r4', {
      token: t.adminToken,
      body: { attachments: [{ $file: theirs }] },
    });
    expect(steal.status).toBe(400);
  });

  test('every placeholder names exactly one part, and every part is used', async () => {
    const missing = await create('r5', form({ title: 'x', profile: { avatar: { $upload: 'nope' } } }, []));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.message).toMatch(/no file part has that name/);

    const unused = await create('r6', form({ title: 'x' }, [['stray', PNG, 'stray.png']]));
    expect(unused.status).toBe(400);
    expect((await unused.json()).error.message).toMatch(/file part "stray" isn't used/);

    const twice = await create(
      'r7',
      form({ title: 'x', pages: [{ scan: { $upload: 'p' } }, { scan: { $upload: 'p' } }] }, [['p', PNG, 'p.png']]),
    );
    expect(twice.status).toBe(400);
    expect((await twice.json()).error.message).toMatch(/more than one position/);

    // A JSON body has no parts to name.
    const json = await call(t.engine, 'POST', '/scrapbooks?id=r8', {
      token: t.adminToken,
      body: { title: 'x', attachments: [{ $upload: 'a' }] },
    });
    expect(json.status).toBe(400);
  });

  test('a write that fails leaves no files behind', async () => {
    const res = await create('r9', form({ profile: { avatar: { $upload: 'me' } } }, [['me', PNG, 'me.png']]));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toBe('missing required fields: title');
    expect(storedIds('r9')).toEqual([]);
  });
});

describe('updating', () => {
  async function seed(): Promise<{ beach: Descriptor; tickets: Descriptor; avatar: Descriptor }> {
    const body = await (
      await create(
        'u1',
        form({ title: 'Trip', profile: { bio: 'hi', avatar: { $upload: 'me' } } }, [
          ['attachments', PNG, 'beach.png'],
          ['attachments', PDF, 'tickets.pdf'],
          ['me', PNG, 'me.png'],
        ]),
      )
    ).json();
    const [beach, tickets] = body.attachments as Descriptor[];
    return { beach: beach!, tickets: tickets!, avatar: body.profile.avatar };
  }

  test('a list is replaced whole: kept files stay, dropped ones are deleted', async () => {
    const { beach, tickets } = await seed();
    const res = await call(t.engine, 'PATCH', '/scrapbooks/u1', {
      token: t.adminToken,
      form: form({ attachments: [{ $file: tickets.id }, { $upload: 'new' }] }, [['new', PNG, 'new.png']]),
    });
    expect(res.status).toBe(200);
    const after = (await res.json()).attachments as Descriptor[];
    expect(after.map((a) => a.name)).toEqual(['tickets.pdf', 'new.png']);
    expect(after[0]!.id).toBe(tickets.id);
    expect(onDisk('u1', tickets.id)).toBe(true);
    expect(onDisk('u1', beach.id)).toBe(false);
    expect(onDisk('u1', after[1]!.id)).toBe(true);
  });

  test('an object merges: patching a sibling keeps the file; null removes it', async () => {
    const { avatar } = await seed();
    const bio = await call(t.engine, 'PATCH', '/scrapbooks/u1', {
      token: t.adminToken,
      body: { profile: { bio: 'updated' } },
    });
    expect((await bio.json()).profile).toEqual({ bio: 'updated', avatar });

    const cleared = await call(t.engine, 'PATCH', '/scrapbooks/u1', {
      token: t.adminToken,
      body: { profile: { avatar: null } },
    });
    expect((await cleared.json()).profile).toEqual({ bio: 'updated' });
    expect(onDisk('u1', avatar.id)).toBe(false);
  });

  test('a patch that never mentions the files leaves them alone', async () => {
    const { beach, tickets } = await seed();
    const res = await call(t.engine, 'PATCH', '/scrapbooks/u1', {
      token: t.adminToken,
      body: { title: 'Renamed' },
    });
    expect(((await res.json()).attachments as Descriptor[]).map((a) => a.id)).toEqual([beach.id, tickets.id]);
    expect(onDisk('u1', beach.id) && onDisk('u1', tickets.id)).toBe(true);
  });

  test('apply (PUT) follows the same rules', async () => {
    const { beach } = await seed();
    const res = await call(t.engine, 'PUT', '/scrapbooks/u1', {
      token: t.adminToken,
      form: form({ title: 'Trip', attachments: [{ $upload: 'x' }] }, [['x', PDF, 'x.pdf']]),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()).attachments as Descriptor[]).map((a) => a.name)).toEqual(['x.pdf']);
    expect(onDisk('u1', beach.id)).toBe(false);
  });

  test('deleting the record deletes its files', async () => {
    const { beach } = await seed();
    const res = await call(t.engine, 'DELETE', '/scrapbooks/u1', { token: t.adminToken });
    expect(res.status).toBe(204);
    expect(onDisk('u1', beach.id)).toBe(false);
  });
});

describe(':download by file id', () => {
  let file: Descriptor;
  beforeEach(async () => {
    const body = await (await create('d1', form({ title: 'x' }, [['attachments', PNG, 'Strand ☀️.png']]))).json();
    file = (body.attachments as Descriptor[])[0]!;
  });

  test('serves the bytes as opaque, with the real filename', async () => {
    const res = await download('d1', { file: file.id });
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-disposition')).toBe(
      `inline; filename="Strand __.png"; filename*=UTF-8''${encodeURIComponent('Strand ☀️.png')}`,
    );
  });

  test("the record's url works as-is, from the query string", async () => {
    const path = new URL(file.url).pathname + new URL(file.url).search;
    const res = await call(t.engine, 'POST', path, { token: t.adminToken });
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
  });

  test("another record's file id is not found here", async () => {
    const other = await (await create('d2', form({ title: 'y' }, [['attachments', PDF, 'b.pdf']]))).json();
    const theirs = (other.attachments as Descriptor[])[0]!.id;
    expect((await download('d1', { file: theirs })).status).toBe(404);
    expect((await download('d1', { file: 'nope' })).status).toBe(404);
  });

  test('says how to name a file', async () => {
    expect((await download('d1', { field: 'cover', file: file.id })).status).toBe(400);
    expect((await download('d1', {})).status).toBe(400);
    expect((await download('d1', { file: file.id }, '?file=other')).status).toBe(400);
    const list = await download('d1', { field: 'attachments' });
    expect(list.status).toBe(400);
    expect((await list.json()).error.message).toMatch(/holds files by id/);
  });

  test('a resource whose only files are nested still has :download', async () => {
    const res = await defineResource(t, {
      singular: 'note',
      plural: 'notes',
      user_settable_create: true,
      schema: {
        type: 'object',
        properties: { files: { type: 'array', items: { type: 'binary', 'x-aepbase-file-field': true } } },
      },
    });
    expect(res.status).toBe(200);
    const made = await call(t.engine, 'POST', '/notes?id=n1', {
      token: t.adminToken,
      form: form(null, [['files', TEXT, 'n.txt']]),
    });
    expect(made.status).toBe(201);
    const id = ((await made.json()).files as Descriptor[])[0]!.id;
    const got = await call(t.engine, 'POST', '/notes/n1:download', { token: t.adminToken, body: { file: id } });
    expect(new TextDecoder().decode(await got.arrayBuffer())).toBe('just some notes');
  });
});

describe('encryption at rest', () => {
  beforeEach(() => {
    process.env.HOMESTEAD_MASTER_KEY = randomBytes(32).toString('base64');
    __resetMasterKeyCacheForTests();
  });
  afterEach(() => {
    delete process.env.HOMESTEAD_MASTER_KEY;
    __resetMasterKeyCacheForTests();
  });

  test('files stored by id are encrypted on disk and decrypted on download', async () => {
    const body = await (await create('e1', form({ title: 'x' }, [['attachments', TEXT, 'secret.txt']]))).json();
    const file = (body.attachments as Descriptor[])[0]!;
    expect(file.encrypted).toBe(true);
    const disk = readFileSync(storedFilePath(t.filesDir, 'scrapbooks/e1', file.id));
    expect(disk.includes(Buffer.from('just some notes'))).toBe(false);

    const res = await download('e1', { file: file.id });
    expect(new TextDecoder().decode(await res.arrayBuffer())).toBe('just some notes');
  });
});

describe('the shared client', () => {
  test("its multipart encoding is what the engine expects", async () => {
    const { encodeBody } = await import('@rambleraptor/homestead-client/src/refs');
    const body = encodeBody({
      title: 'From the client',
      attachments: [new File([PNG], 'a.png'), new File([PDF], 'b.pdf')],
      profile: { bio: 'hi', avatar: new File([PNG], 'me.png') },
    });
    expect(body).toBeInstanceOf(FormData);
    const res = await create('c1', body as FormData);
    expect(res.status).toBe(201);
    const made = await res.json();
    expect((made.attachments as Descriptor[]).map((a) => a.name)).toEqual(['a.png', 'b.pdf']);
    expect(made.profile).toMatchObject({ bio: 'hi', avatar: { name: 'me.png', media_type: 'image/png' } });
  });
});

describe('concurrent writes', () => {
  test('a write that keeps a file another write just removed is refused, not left dangling', async () => {
    const made = await (await create('k1', form({ title: 'x' }, [['attachments', PNG, 'a.png']]))).json();
    const f1 = (made.attachments as Descriptor[])[0]!.id;

    // B reads the record, then its body arrives slowly…
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slowBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        await gate;
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ attachments: [{ $file: f1 }] })));
        controller.close();
      },
    });
    const b = t.engine.fetch(
      new Request('http://localhost:8090/scrapbooks/k1', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${t.adminToken}`, 'Content-Type': 'application/json' },
        body: slowBody,
        duplex: 'half',
      } as RequestInit),
    );

    // …while A removes that file and commits.
    const a = await call(t.engine, 'PATCH', '/scrapbooks/k1', {
      token: t.adminToken,
      body: { attachments: [] },
    });
    expect(a.status).toBe(200);
    expect(onDisk('k1', f1)).toBe(false);

    release();
    const res = await b;
    expect(res.status).toBe(409);
    const now = await (await call(t.engine, 'GET', '/scrapbooks/k1', { token: t.adminToken })).json();
    expect(now.attachments).toEqual([]);
  });
});
