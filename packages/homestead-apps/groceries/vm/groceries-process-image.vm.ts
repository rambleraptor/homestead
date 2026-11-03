/**
 * Groceries — `groceries:process-image`, on the VM tier.
 *
 * The method takes the photo the way every custom method takes a file: an
 * uploaded part named by an `$upload` placeholder (multipart), not base64 in
 * JSON. The AI is the in-process e2e stub, so what it "reads" doesn't matter
 * here — only that the upload reaches the model and errors come back in the
 * API's standard problem shape.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { postCustomMethod } from '../../../../tests/e2e/utils/aepbase-helpers';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe('Groceries — process-image', () => {
  let h: Harness;
  let token: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
  });

  afterEach(async () => {
    await h.close();
  });

  test('reads an uploaded photo', async () => {
    const image = new File([new Uint8Array(PNG_SIGNATURE)], 'list.png', { type: 'image/png' });
    const res = await postCustomMethod(token, '/groceries:process-image', { image });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; message: string };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('refuses base64 in JSON with a standard 400 problem', async () => {
    const res = await postCustomMethod(token, '/groceries:process-image', {
      image: 'iVBORw0KGgo=',
      mime_type: 'image/png',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      type: 'about:blank',
      status: 400,
      detail: expect.stringMatching(/uploaded file/),
      error: { code: 400 },
    });
  });

  test('refuses a file that is not an image', async () => {
    const image = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    const res = await postCustomMethod(token, '/groceries:process-image', { image });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail: string }).detail).toMatch(/Must be an image/);
  });
});
