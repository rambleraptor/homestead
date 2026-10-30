/**
 * HEIC/HEIF photos → JPEG before upload.
 *
 * HEIC is how iPhones (and many Android phones) store photos, but the AI
 * providers that read a document don't take it and most browsers can't show
 * it, so a HEIC file is converted on the device before it's stored. Safari
 * decodes HEIC natively; everywhere else the libheif build in `heic-to` does it
 * — a few MB, so it's imported only when a HEIC file actually turns up.
 */

const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

/** The `accept` entries for HEIC; listed by extension too, since some pickers report no type. */
export const HEIC_ACCEPT = 'image/heic,image/heif,.heic,.heif';

const JPEG_QUALITY = 0.9;

/** Whether a file is HEIC/HEIF, by its type or, when that's blank, its name. */
export function isHeicFile(file: File): boolean {
  if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
  return !file.type && /\.(heic|heif)$/i.test(file.name);
}

/** "IMG_0042.HEIC" → "IMG_0042.jpg". */
export function jpegName(name: string): string {
  return `${name.replace(/\.(heic|heif)$/i, '') || 'photo'}.jpg`;
}

/** The browser's own HEIC decoder (Safari), or null where there isn't one. */
async function decodeNatively(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
}

async function decodeWithLibheif(file: File): Promise<Blob> {
  const { heicTo } = await import('heic-to');
  return heicTo({ blob: file, type: 'image/jpeg', quality: JPEG_QUALITY });
}

/**
 * The file as it should be uploaded: a HEIC photo becomes a JPEG of the same
 * name, anything else is returned untouched.
 */
export async function toUploadable(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  const jpeg = (await decodeNatively(file)) ?? (await decodeWithLibheif(file));
  return new File([jpeg], jpegName(file.name), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}
