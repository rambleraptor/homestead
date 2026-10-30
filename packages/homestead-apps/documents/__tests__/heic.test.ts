import { afterEach, describe, expect, it, vi } from 'vitest';

const heicTo = vi.fn();
vi.mock('heic-to', () => ({ heicTo }));

import { isHeicFile, jpegName, toUploadable } from '../heic';

afterEach(() => {
  heicTo.mockReset();
  vi.unstubAllGlobals();
});

describe('isHeicFile', () => {
  it('goes by the MIME type', () => {
    expect(isHeicFile(new File(['x'], 'a.bin', { type: 'image/heic' }))).toBe(true);
    expect(isHeicFile(new File(['x'], 'a.bin', { type: 'IMAGE/HEIF' }))).toBe(true);
    expect(isHeicFile(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBe(false);
  });

  it('falls back to the extension only when the type is blank', () => {
    expect(isHeicFile(new File(['x'], 'IMG_0042.HEIC'))).toBe(true);
    expect(isHeicFile(new File(['x'], 'a.heif.pdf', { type: 'application/pdf' }))).toBe(false);
  });
});

describe('jpegName', () => {
  it('swaps a HEIC extension for .jpg', () => {
    expect(jpegName('IMG_0042.HEIC')).toBe('IMG_0042.jpg');
    expect(jpegName('scan.heif')).toBe('scan.jpg');
    expect(jpegName('.heic')).toBe('photo.jpg');
  });
});

describe('toUploadable', () => {
  it('passes anything that isn’t HEIC through untouched', async () => {
    const pdf = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
    expect(await toUploadable(pdf)).toBe(pdf);
    expect(heicTo).not.toHaveBeenCalled();
  });

  it('converts HEIC with libheif where the browser can’t decode it', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('unsupported')));
    heicTo.mockResolvedValue(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }));
    const heic = new File(['heic-bytes'], 'IMG_0042.HEIC', {
      type: 'image/heic',
      lastModified: 1234,
    });

    const out = await toUploadable(heic);

    expect(heicTo).toHaveBeenCalledWith({ blob: heic, type: 'image/jpeg', quality: 0.9 });
    expect(out.name).toBe('IMG_0042.jpg');
    expect(out.type).toBe('image/jpeg');
    expect(out.lastModified).toBe(1234);
    expect(await out.text()).toBe('jpeg-bytes');
  });

  it('surfaces a failed conversion rather than uploading the HEIC', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('unsupported')));
    heicTo.mockRejectedValue(new Error('corrupt file'));
    await expect(
      toUploadable(new File(['x'], 'a.heic', { type: 'image/heic' })),
    ).rejects.toThrow('corrupt file');
  });
});
