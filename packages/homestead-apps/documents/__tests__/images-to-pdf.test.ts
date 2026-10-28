import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { imagesToPdf, jpegOrientation, placement } from '../images-to-pdf';

/** A big-endian 16-bit value as two bytes. */
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];

/** An Exif APP1 segment holding only an orientation tag. */
function exifSegment(orientation: number, order: 'II' | 'MM'): number[] {
  const u16 = (n: number) => (order === 'II' ? [n & 0xff, (n >> 8) & 0xff] : be16(n));
  const u32 = (n: number) =>
    order === 'II'
      ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
      : [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const tiff = [
    ...(order === 'II' ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42),
    ...u32(8), // IFD0 right after the header
    ...u16(1), // one entry
    ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0,
    ...u32(0), // no next IFD
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return [0xff, 0xe1, ...be16(payload.length + 2), ...payload];
}

/**
 * The headers of a baseline JPEG — enough for pdf-lib, which reads the frame
 * header for size and colour but copies the stream without decoding it.
 */
function jpeg(width: number, height: number, segments: number[] = []): Uint8Array {
  const sof = [
    0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3,
    1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1,
  ];
  return new Uint8Array([0xff, 0xd8, ...segments, ...sof, 0xff, 0xd9]);
}

/** Every page's [width, height], in order. */
async function pageSizes(pdfBytes: Uint8Array): Promise<number[][]> {
  const pdf = await PDFDocument.load(pdfBytes);
  return pdf.getPages().map((page) => {
    const { width, height } = page.getSize();
    return [width, height];
  });
}

/** The raw bytes of each JPEG (DCT-encoded) image stream in the PDF. */
async function jpegStreams(pdfBytes: Uint8Array): Promise<Uint8Array[]> {
  const pdf = await PDFDocument.load(pdfBytes);
  return pdf.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter(
      (object): object is PDFRawStream =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of('Filter')) === PDFName.of('DCTDecode'),
    )
    .map((stream) => stream.contents);
}

describe('jpegOrientation', () => {
  it('reads the orientation tag in either byte order', () => {
    expect(jpegOrientation(jpeg(4, 3, exifSegment(6, 'II')))).toBe(6);
    expect(jpegOrientation(jpeg(4, 3, exifSegment(8, 'MM')))).toBe(8);
  });

  it('finds the Exif block after other header segments', () => {
    const jfif = [0xff, 0xe0, ...be16(16), 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    expect(jpegOrientation(jpeg(4, 3, [...jfif, ...exifSegment(3, 'II')]))).toBe(3);
  });

  it('reads as upright when there is no tag, a bad one, or no JPEG', () => {
    expect(jpegOrientation(jpeg(4, 3))).toBe(1);
    expect(jpegOrientation(jpeg(4, 3, exifSegment(9, 'II')))).toBe(1);
    expect(jpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(jpegOrientation(jpeg(4, 3, exifSegment(6, 'II')).slice(0, 20))).toBe(1);
  });
});

describe('placement', () => {
  /** Where the image's four corners land once drawn as placed. */
  function drawnCorners(orientation: number, width: number, height: number) {
    const p = placement(orientation, width, height);
    const rad = (p.rotate * Math.PI) / 180;
    // `+ 0` folds the -0 that rounding a tiny negative leaves into 0.
    const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([u, v]) => [
      Math.round(p.x + u! * Math.cos(rad) - v! * Math.sin(rad)) + 0,
      Math.round(p.y + u! * Math.sin(rad) + v! * Math.cos(rad)) + 0,
    ]);
    return { p, corners };
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('keeps orientation %i exactly on the page', (orientation) => {
    const { p, corners } = drawnCorners(orientation, 400, 300);
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([0, p.pageWidth]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, p.pageHeight]);
  });

  it('turns a quarter-turned photo onto a page with its sides swapped', () => {
    expect(placement(6, 400, 300)).toMatchObject({ pageWidth: 300, pageHeight: 400 });
    expect(placement(8, 400, 300)).toMatchObject({ pageWidth: 300, pageHeight: 400 });
    expect(placement(3, 400, 300)).toMatchObject({ pageWidth: 400, pageHeight: 300 });
  });
});

describe('imagesToPdf', () => {
  it('makes one page per image, in order, a point per pixel', async () => {
    const pdf = await imagesToPdf([
      { bytes: jpeg(400, 300), mediaType: 'image/jpeg' },
      { bytes: jpeg(400, 300, exifSegment(6, 'II')), mediaType: 'image/jpeg' },
      { bytes: jpeg(1200, 900), mediaType: 'image/jpeg' },
    ]);
    expect(await pageSizes(pdf)).toEqual([
      [400, 300],
      [300, 400],
      [1200, 900],
    ]);
  });

  it('embeds each JPEG byte for byte — nothing is re-compressed', async () => {
    const front = jpeg(400, 300, exifSegment(6, 'MM'));
    const back = jpeg(640, 480);
    const pdf = await imagesToPdf([
      { bytes: front, mediaType: 'image/jpeg' },
      { bytes: back, mediaType: 'image/jpeg' },
    ]);
    const streams = await jpegStreams(pdf);
    expect(streams).toHaveLength(2);
    expect(streams).toContainEqual(front);
    expect(streams).toContainEqual(back);
  });

  it('shrinks the page, not the image, past the largest page readers accept', async () => {
    const huge = jpeg(16_320, 12_240);
    const pdf = await imagesToPdf([{ bytes: huge, mediaType: 'image/jpeg' }]);
    const [[width, height]] = await pageSizes(pdf);
    expect(width).toBeCloseTo(14_400);
    expect(height).toBeCloseTo(10_800);
    expect(await jpegStreams(pdf)).toEqual([huge]);
  });

  it('refuses images it cannot embed as they are', async () => {
    await expect(
      imagesToPdf([{ bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/webp' }]),
    ).rejects.toThrow(/page 1 is image\/webp/);
    await expect(imagesToPdf([])).rejects.toThrow(/at least one image/);
  });
});
