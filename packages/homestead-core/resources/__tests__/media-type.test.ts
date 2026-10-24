import { describe, expect, it } from 'vitest';
import { isConfirmedMediaType, resolveMediaType, sniffMediaType } from '../media-type';

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const PDF = bytes(0x25, 0x50, 0x44, 0x46);
const HEIC = new Uint8Array([0, 0, 0, 24, ...'ftypheic'.split('').map((c) => c.charCodeAt(0)), 0, 0]);
const TEXT = new TextEncoder().encode('hello, world');

describe('sniffMediaType', () => {
  it('names formats by their leading bytes', () => {
    expect(sniffMediaType(PNG)).toBe('image/png');
    expect(sniffMediaType(PDF)).toBe('application/pdf');
    expect(sniffMediaType(HEIC)).toBe('image/heic');
    expect(sniffMediaType(TEXT)).toBeNull();
  });
});

describe('resolveMediaType', () => {
  it('trusts the bytes over the claim', () => {
    expect(resolveMediaType(PNG, 'application/pdf')).toBe('image/png');
  });

  it('keeps a claim it cannot check, without parameters', () => {
    expect(resolveMediaType(TEXT, 'Text/CSV; charset=utf-8')).toBe('text/csv');
  });

  it('refuses a claim to be a recognizable format the bytes are not', () => {
    expect(resolveMediaType(TEXT, 'image/png')).toBe('application/octet-stream');
    expect(resolveMediaType(TEXT, '')).toBe('application/octet-stream');
  });
});

describe('isConfirmedMediaType', () => {
  it('is true only for formats the bytes can confirm', () => {
    expect(isConfirmedMediaType('image/png')).toBe(true);
    expect(isConfirmedMediaType('application/pdf')).toBe(true);
    expect(isConfirmedMediaType('image/svg+xml')).toBe(false);
    expect(isConfirmedMediaType('text/html')).toBe(false);
  });
});
