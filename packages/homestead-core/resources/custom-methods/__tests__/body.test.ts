import { describe, expect, it } from 'vitest';
import { encodeMethodBody } from '@rambleraptor/homestead-client';
import { readMethodBody } from '../body';
import { ProblemError } from '../../problem';

function request(body: BodyInit | null, contentType?: string): Request {
  return new Request('http://x/things:verb', {
    method: 'POST',
    body,
    headers: contentType ? { 'Content-Type': contentType } : {},
  });
}

function encoded(body: Record<string, unknown>): Request {
  const enc = encodeMethodBody(body);
  return enc instanceof FormData
    ? request(enc)
    : request(JSON.stringify(enc), 'application/json');
}

describe('readMethodBody', () => {
  it('reads a JSON body', async () => {
    expect(await readMethodBody(encoded({ format: 'csv', validate_only: true }))).toEqual({
      format: 'csv',
      validate_only: true,
    });
  });

  it('treats an empty body as {}', async () => {
    expect(await readMethodBody(request(null))).toEqual({});
  });

  it('round-trips files at the top level and nested, with names and types', async () => {
    const photo = new File(['png-bytes'], 'photo.png', { type: 'image/png' });
    const a = new File(['a'], 'a.csv', { type: 'text/csv' });
    const b = new File(['b'], 'b.csv', { type: 'text/csv' });
    const body = await readMethodBody<{
      image: File;
      files: File[];
      meta: { cover: File; note: string };
      validate_only: boolean;
    }>(encoded({ image: photo, files: [a, b], meta: { cover: photo, note: 'hi' }, validate_only: true }));

    expect(body.image).toBeInstanceOf(File);
    expect(body.image.name).toBe('photo.png');
    expect(body.image.type).toBe('image/png');
    expect(await body.image.text()).toBe('png-bytes');
    expect(body.files.map((f) => f.name)).toEqual(['a.csv', 'b.csv']);
    expect(await body.files[1].text()).toBe('b');
    expect(body.meta.note).toBe('hi');
    expect(body.meta.cover.name).toBe('photo.png');
    // Scalars keep their JSON types — no stringly-typed form fields.
    expect(body.validate_only).toBe(true);
  });

  it.each([
    ['a placeholder naming no part', () => {
      const form = new FormData();
      form.append('body', JSON.stringify({ image: { $upload: 'missing' } }));
      return request(form);
    }, /No "missing" part/],
    ['a part no placeholder names', () => {
      const form = new FormData();
      form.append('body', '{}');
      form.append('stray', new File(['x'], 'x.txt'));
      return request(form);
    }, /isn't referenced/],
    ['a text field outside the body part', () => {
      const form = new FormData();
      form.append('format', 'csv');
      return request(form);
    }, /Unexpected "format" part/],
    ['a body part that is not JSON', () => {
      const form = new FormData();
      form.append('body', '{nope');
      return request(form);
    }, /not valid JSON/],
    ['malformed JSON', () => request('{nope', 'application/json'), /must be JSON/],
    ['a JSON array', () => request('[1]', 'application/json'), /JSON object/],
    ['a placeholder in a JSON body', () => request(JSON.stringify({ f: { $upload: 'p' } }), 'application/json'), /No "p" part/],
  ])('rejects %s with a 400', async (_label, make, message) => {
    const err = await readMethodBody(make()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProblemError);
    expect((err as ProblemError).status).toBe(400);
    expect((err as ProblemError).message).toMatch(message);
  });

  it('rejects a body that is neither JSON nor multipart with a 415', async () => {
    const err = await readMethodBody(request('a=b', 'application/x-www-form-urlencoded')).catch(
      (e: unknown) => e,
    );
    expect((err as ProblemError).status).toBe(415);
  });
});
