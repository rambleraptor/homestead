import { describe, expect, it } from 'vitest';
import { normalizeErrorResponse, problemBody, problemResponse, toProblem } from '../problem';

describe('problem bodies', () => {
  it('carry the AEP-193 fields and the client envelope', () => {
    expect(problemBody(404, 'no such recipe')).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'no such recipe',
      error: { code: 404, message: 'no such recipe' },
    });
  });

  it('fall back to a generic title for an unlisted status', () => {
    expect(problemBody(418, 'teapot').title).toBe('Error');
  });
});

describe('normalizeErrorResponse', () => {
  it('passes success through untouched', async () => {
    const res = Response.json({ ok: true });
    expect(await normalizeErrorResponse(res)).toBe(res);
  });

  it('passes a standard problem through untouched', async () => {
    const res = problemResponse(409, 'taken');
    expect(await normalizeErrorResponse(res)).toBe(res);
  });

  it.each([
    [{ error: 'Bad request', message: 'Missing image' }, 'Missing image'],
    [{ error: 'Only a string' }, 'Only a string'],
    [{ error: { code: 400, message: 'Nested' } }, 'Nested'],
  ])('reshapes %j', async (body, detail) => {
    const res = await normalizeErrorResponse(Response.json(body, { status: 400 }));
    expect(await res.json()).toMatchObject({ status: 400, detail, error: { code: 400, message: detail } });
  });

  it('uses a plain-text body as the detail', async () => {
    const res = await normalizeErrorResponse(new Response('upstream down', { status: 502 }));
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toMatchObject({ title: 'Bad Gateway', detail: 'upstream down' });
  });

  it('uses the reason phrase for an empty body', async () => {
    const res = await normalizeErrorResponse(new Response(null, { status: 403 }));
    expect(await res.json()).toMatchObject({ detail: 'Forbidden' });
  });
});

describe('toProblem', () => {
  it('keeps a 4xx/5xx status a thrown value carries, else 500', () => {
    expect(toProblem(Object.assign(new Error('x'), { status: 404 })).status).toBe(404);
    expect(toProblem(Object.assign(new Error('x'), { status: 200 })).status).toBe(500);
  });
});
