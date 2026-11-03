import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_PREVIEWS,
  PREVIEW_TTL_MS,
  clearPreviews,
  hasPreview,
  savePreview,
  takePreview,
} from '../previews';

const owner = { userId: 'u1', plural: 'recipes', format: 'social' };
const items = [{ index: 0, data: { title: 'Rice' }, errors: [], warnings: [] }];

beforeEach(() => clearPreviews());

describe('bulk-import previews', () => {
  it('hands back the held items once, then forgets them', () => {
    const id = savePreview(owner, items);
    expect(hasPreview(id, owner)).toBe(true);
    expect(takePreview(id, owner)).toEqual(items);
    expect(takePreview(id, owner)).toBeUndefined();
    expect(hasPreview(id, owner)).toBe(false);
  });

  it.each([
    ['another person', { ...owner, userId: 'u2' }],
    ['another collection', { ...owner, plural: 'gift-cards' }],
    ['another format', { ...owner, format: 'text' }],
  ])('is unknown to %s, and stays usable by its owner', (_label, other) => {
    const id = savePreview(owner, items);
    expect(hasPreview(id, other)).toBe(false);
    expect(takePreview(id, other)).toBeUndefined();
    expect(takePreview(id, owner)).toEqual(items);
  });

  it('expires', () => {
    const now = 1_000_000;
    const id = savePreview(owner, items, now);
    expect(hasPreview(id, owner, now + PREVIEW_TTL_MS - 1)).toBe(true);
    expect(takePreview(id, owner, now + PREVIEW_TTL_MS)).toBeUndefined();
  });

  it('drops the oldest preview past the cap', () => {
    const first = savePreview(owner, items);
    const ids = Array.from({ length: MAX_PREVIEWS }, () => savePreview(owner, items));
    expect(hasPreview(first, owner)).toBe(false);
    expect(ids.every((id) => hasPreview(id, owner))).toBe(true);
  });

  it('mints unguessable, distinct ids', () => {
    const a = savePreview(owner, items);
    const b = savePreview(owner, items);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
