/**
 * Combine photos of one document — the front and back of a card, the pages of a
 * letter — into a single PDF, one page per photo, in order.
 *
 * Built to lose nothing. A JPEG's bytes are embedded as they are (pdf-lib copies
 * the stream; nothing is decoded or re-compressed), a PNG is decoded and stored
 * losslessly, and every page is sized one point per pixel so a page rendered at
 * 72 dpi — which is how a PDF rasterizer sizes its output — comes back at the
 * photo's own resolution. Shrinking pages to Letter would have the rasterizer
 * downsample them, losing exactly the fine print (a serial number) we care about.
 *
 * Phones often store a photo sideways with an EXIF tag saying how to turn it.
 * pdf-lib ignores that tag, so the orientation is read here and the image drawn
 * rotated onto an upright page.
 */

import { degrees, PDFDocument } from 'pdf-lib';

export interface PageImage {
  bytes: Uint8Array;
  /** The image's MIME type; only JPEG and PNG embed without conversion. */
  mediaType: string;
}

/**
 * The largest page side, in points, that every PDF reader accepts (Acrobat's
 * 200-inch limit). A larger photo gets a proportionally smaller page — its pixels
 * are untouched, only drawn at a finer scale.
 */
const MAX_PAGE_POINTS = 14_400;

/** Build one PDF with a page per image, in the order given. */
export async function imagesToPdf(images: PageImage[]): Promise<Uint8Array> {
  if (!images.length) throw new Error('imagesToPdf needs at least one image');
  const pdf = await PDFDocument.create();

  for (const [index, image] of images.entries()) {
    let embedded;
    let orientation = 1;
    if (image.mediaType === 'image/jpeg') {
      embedded = await pdf.embedJpg(image.bytes);
      orientation = jpegOrientation(image.bytes);
    } else if (image.mediaType === 'image/png') {
      embedded = await pdf.embedPng(image.bytes);
    } else {
      throw new Error(
        `page ${index + 1} is ${image.mediaType || 'an unknown type'} — only JPEG and PNG can be combined`,
      );
    }

    const scale = Math.min(1, MAX_PAGE_POINTS / Math.max(embedded.width, embedded.height));
    const width = embedded.width * scale;
    const height = embedded.height * scale;
    const place = placement(orientation, width, height);
    const page = pdf.addPage([place.pageWidth, place.pageHeight]);
    page.drawImage(embedded, {
      x: place.x,
      y: place.y,
      width,
      height,
      rotate: degrees(place.rotate),
    });
  }

  return pdf.save();
}

export interface Placement {
  pageWidth: number;
  pageHeight: number;
  /** Where the image's own bottom-left corner lands on the page. */
  x: number;
  y: number;
  /** Counter-clockwise degrees, about (x, y) — pdf-lib's convention. */
  rotate: number;
}

/**
 * Where to draw a `width` × `height` image so it appears upright, given its EXIF
 * orientation. Rotating about the image's corner moves it, so the anchor shifts
 * to bring it back onto the page: a quarter turn swaps the page's sides.
 *
 * The mirrored orientations (2, 4, 5, 7) come from front cameras on a few
 * phones, not from photographing paper; they get their rotation without the
 * mirror.
 */
export function placement(orientation: number, width: number, height: number): Placement {
  switch (orientation) {
    case 3:
    case 4:
      return { pageWidth: width, pageHeight: height, x: width, y: height, rotate: 180 };
    case 6:
    case 7:
      // Stored with the top on the left; turn a quarter clockwise.
      return { pageWidth: height, pageHeight: width, x: 0, y: width, rotate: -90 };
    case 5:
    case 8:
      // Stored with the top on the right; turn a quarter counter-clockwise.
      return { pageWidth: height, pageHeight: width, x: height, y: 0, rotate: 90 };
    default:
      return { pageWidth: width, pageHeight: height, x: 0, y: 0, rotate: 0 };
  }
}

/**
 * A JPEG's EXIF orientation (1-8), or 1 when it has none or it can't be read.
 * Walks the header segments to the Exif APP1 block and reads tag 0x0112 from its
 * first IFD; stops at the image data, where no header can follow.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return 1;
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset += 1; // fill byte before a marker
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return 1; // start of scan / end of image
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    const end = offset + 2 + length;
    if (marker === 0xe1 && isExifHeader(bytes, offset + 4)) {
      return tiffOrientation(bytes, offset + 10, Math.min(end, bytes.length));
    }
    offset = end;
  }
  return 1;
}

/** `Exif\0\0`, the start of an Exif APP1 payload. */
function isExifHeader(bytes: Uint8Array, at: number): boolean {
  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  return header.every((byte, i) => bytes[at + i] === byte);
}

/** Orientation from a TIFF block spanning `[start, end)`, or 1. */
function tiffOrientation(bytes: Uint8Array, start: number, end: number): number {
  if (start + 8 > end) return 1;
  const little = bytes[start] === 0x49 && bytes[start + 1] === 0x49; // "II"
  const big = bytes[start] === 0x4d && bytes[start + 1] === 0x4d; // "MM"
  if (!little && !big) return 1;

  const u16 = (at: number) =>
    little ? bytes[at]! | (bytes[at + 1]! << 8) : (bytes[at]! << 8) | bytes[at + 1]!;
  const u32 = (at: number) =>
    little
      ? (u16(at) | (u16(at + 2) << 16)) >>> 0
      : ((u16(at) << 16) | u16(at + 2)) >>> 0;

  const ifd = start + u32(start + 4);
  if (ifd + 2 > end) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 1;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}
