import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHomesteadClient } from '@rambleraptor/homestead-client';
import {
  collectionAt,
  parseSelection,
  previewHint,
  readUpload,
  uploadsFrom,
} from './resources-custom.ts';
import { parseFlags } from './resources.ts';
import { FlagError } from './resources-flags.ts';

const dir = mkdtempSync(join(tmpdir(), 'hs-cli-'));
const png = join(dir, 'list.png');
writeFileSync(png, 'png-bytes');
const csv = join(dir, 'a.csv');
writeFileSync(csv, 'name\n');

describe('parseFlags', () => {
  it('keeps every value of a repeated flag, and the last as the flag', () => {
    const { flags, repeated, positionals } = parseFlags([
      'recipe',
      'bulk-import',
      '--file',
      'a.paprikarecipe',
      '--file=b.paprikarecipe',
      '--upload',
      'image=./list.png',
      '--validate-only',
    ]);
    expect(positionals).toEqual(['recipe', 'bulk-import']);
    expect(repeated.file).toEqual(['a.paprikarecipe', 'b.paprikarecipe']);
    expect(flags.file).toBe('b.paprikarecipe');
    expect(repeated.upload).toEqual(['image=./list.png']);
    expect(flags['validate-only']).toBe(true);
  });

  it('splits --name=value at the first = only', () => {
    expect(parseFlags(['--upload=image=./x.png']).repeated.upload).toEqual(['image=./x.png']);
  });
});

describe('uploads', () => {
  it('reads a file with its name and a type from its extension', async () => {
    const file = readUpload(png);
    expect(file.name).toBe('list.png');
    expect(file.type).toBe('image/png');
    expect(await file.text()).toBe('png-bytes');
  });

  it('gives a field named once one file, and a field named twice a list', () => {
    const uploads = uploadsFrom([`image=${png}`, `files=${csv}`, `files=${png}`]);
    expect(uploads.image).toBeInstanceOf(File);
    expect((uploads.files as File[]).map((f) => f.name)).toEqual(['a.csv', 'list.png']);
  });

  it('refuses a malformed --upload or a missing file', () => {
    expect(() => uploadsFrom(['image'])).toThrow(FlagError);
    expect(() => uploadsFrom(['image='])).toThrow(FlagError);
    expect(() => readUpload(join(dir, 'nope.png'))).toThrow(/cannot read/);
  });
});

describe('parseSelection', () => {
  it('reads indices or *', () => {
    expect(parseSelection('0, 2')).toEqual([0, 2]);
    expect(parseSelection('*')).toBe('*');
    expect(parseSelection(undefined)).toBeUndefined();
  });

  it('refuses anything else', () => {
    expect(() => parseSelection('a,b')).toThrow(FlagError);
    expect(() => parseSelection('-1')).toThrow(FlagError);
    expect(() => parseSelection(true)).toThrow(FlagError);
  });
});

describe('collectionAt', () => {
  it('walks a nested collection path', async () => {
    const calls: string[] = [];
    const hs = createHomesteadClient({
      fetch: (async (url: string) => {
        calls.push(String(url));
        return new Response('{"results":[]}', { headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch,
    });
    await collectionAt(hs, 'users/u1/notifications').page();
    expect(new URL(calls[0]!, 'http://x').pathname).toBe('/api/aep/users/u1/notifications');
  });
});

describe('previewHint', () => {
  it('says how to import the preview', () => {
    const hint = previewHint('homestead resources recipes bulk-import', 'social', {
      validate_only: true,
      preview_id: 'p1',
      items: [],
      summary: { total: 2, valid: 1, invalid: 1 },
    });
    expect(hint).toContain('2 rows, 1 importable');
    expect(hint).toContain('--format social --preview-id p1');
  });
});
